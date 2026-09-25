// ==UserScript==
// @name         BOC Client
// @namespace    https://github.com/Belgiantech-baf/geofs-live-radar
// @version      4.0.0
// @description  BAF Operations Client sidebar for GeoFS clients.
// @match        https://www.geo-fs.com/*
// @match        https://geo-fs.com/*
// @run-at       document-idle
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'boc.geofs.sidebar.v1';
  const SERVER_URL_KEY = 'boc.server.url';
  const SECTION_LIST = ['Dashboard', 'BAF Chat', 'Mini Radar', 'Active BAF Pilots', 'Operations', 'Alerts', 'Logs', 'Settings'];

  const defaultSettings = {
    bafChat: true,
    radar: true,
    alerts: true,
    tracking: true,
    darkMode: true,
    compactMode: false
  };

  function readState() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        section: saved.section || 'Dashboard',
        open: !!saved.open,
        theme: saved.theme || 'dark',
        filters: Object.assign({ radar: 'All', chat: '#operations' }, saved.filters || {}),
        settings: Object.assign({}, defaultSettings, saved.settings || {}),
        width: 360
      };
    } catch (error) {
      return {
        section: 'Dashboard',
        open: false,
        theme: 'dark',
        filters: { radar: 'All', chat: '#operations' },
        settings: Object.assign({}, defaultSettings),
        width: 360
      };
    }
  }

  const state = readState();

  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        section: state.section,
        open: state.open,
        theme: state.theme,
        filters: state.filters,
        settings: state.settings,
        width: state.width
      }));
    } catch (error) {
      // ignore storage errors
    }
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (char) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char];
    });
  }

  function getServerUrl() {
    try {
      return localStorage.getItem(SERVER_URL_KEY) || 'https://geofs-live-radar.onrender.com/api/boc/log';
    } catch (error) {
      return 'https://geofs-live-radar.onrender.com/api/boc/log';
    }
  }

  function getWindowBats() {
    const root = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    return root.BATS || root.BOC?.app?.bats || root.BOC?.Adapter?.BATS || null;
  }

  function getBatsSnapshot() {
    const bats = getWindowBats();
    const pilots = bats && typeof bats.getActivePilots === 'function' ? bats.getActivePilots() : [];
    const alerts = bats && typeof bats.getAlerts === 'function' ? bats.getAlerts() : [];
    const operations = bats && typeof bats.getOperations === 'function' ? bats.getOperations() : [];
    return {
      connected: Boolean(bats),
      pilots: Array.isArray(pilots) ? pilots : [],
      alerts: Array.isArray(alerts) ? alerts : [],
      operations: Array.isArray(operations) ? operations : [],
      status: bats ? 'BATS CONNECTED' : 'BATS DISCONNECTED'
    };
  }

  async function relayToServer(type, payload) {
    const url = getServerUrl();
    if (!url) return;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type,
          source: 'GeoFS-BOC',
          channel: 'operations',
          timestamp: Date.now(),
          ...payload
        })
      });
      if (!response.ok) {
        throw new Error('HTTP ' + response.status);
      }
    } catch (error) {
      // intentionally silent; server can be offline without crashing BOC
    }
  }

  function buildCss() {
    return `
      :root {
        --boc-geo-panel-bg: rgba(14, 18, 24, 0.96);
        --boc-geo-panel-alt: rgba(21, 27, 35, 0.95);
        --boc-geo-border: rgba(141, 163, 190, 0.2);
        --boc-geo-text: #edf5ff;
        --boc-geo-text-soft: #afc2d8;
        --boc-geo-blue: #5ea9ff;
        --boc-geo-green: #46d39d;
        --boc-geo-yellow: #f1c66a;
        --boc-geo-orange: #ffb266;
        --boc-geo-red: #ff7f7f;
        --boc-geo-purple: #b29afc;
      }

      .geofs-ui-left {
        position: relative;
        overflow: visible;
      }

      #boc-module-button {
        position: relative;
        z-index: 50;
        margin: 0 8px;
        min-width: 96px;
        height: 32px;
        padding: 0 12px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.05em;
        cursor: pointer;
      }

      .boc-native-button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        min-width: 96px;
        color: var(--boc-geo-text);
        background: rgba(20, 28, 36, 0.94);
        border: 1px solid rgba(190, 205, 221, 0.16);
        border-radius: 8px;
        box-shadow: inset 0 1px 0 rgba(255,255,255,0.06);
        line-height: 1;
      }

      .boc-native-button .material-icons {
        font-size: 18px;
        line-height: 1;
      }

      .boc-native-button:hover {
        background: rgba(30, 38, 48, 0.97);
      }

      .boc-native-button.active {
        background: rgba(94, 169, 255, 0.18);
        border-color: rgba(94, 169, 255, 0.4);
        box-shadow: inset 0 0 0 1px rgba(94, 169, 255, 0.18), 0 0 0 1px rgba(94, 169, 255, 0.12);
      }

      .boc-native-panel {
        position: absolute;
        left: 0;
        top: 0;
        bottom: 0;
        width: 340px;
        max-width: 86vw;
        display: flex;
        flex-direction: column;
        background: var(--boc-geo-panel-bg);
        border-right: 1px solid var(--boc-geo-border);
        border-left: 1px solid rgba(255,255,255,0.04);
        color: var(--boc-geo-text);
        font-family: "Segoe UI", Arial, sans-serif;
        box-shadow: 8px 0 22px rgba(0, 0, 0, 0.28);
        transform: translateX(-104%);
        transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
        z-index: 3;
        pointer-events: auto;
      }

      .boc-native-panel.open {
        transform: translateX(0);
      }

      .boc-native-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 12px 14px 10px;
        border-bottom: 1px solid var(--boc-geo-border);
        background: rgba(22, 29, 37, 0.96);
      }

      .boc-native-brand {
        display: flex;
        align-items: center;
        gap: 10px;
        min-width: 0;
      }

      .boc-native-mark {
        width: 30px;
        height: 30px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        background: linear-gradient(135deg, #6caefe, #8ae7d0);
        color: #0d1a25;
        font-weight: 800;
        letter-spacing: 0.04em;
        font-size: 10px;
      }

      .boc-native-title {
        font-size: 12px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        font-weight: 800;
      }

      .boc-native-subtitle {
        font-size: 10px;
        color: var(--boc-geo-text-soft);
      }

      .boc-native-close {
        appearance: none;
        border: 1px solid rgba(255,255,255,0.12);
        background: rgba(255,255,255,0.04);
        color: var(--boc-geo-text);
        width: 28px;
        height: 28px;
        border-radius: 6px;
        cursor: pointer;
      }

      .boc-native-nav {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 6px;
        padding: 8px;
        border-bottom: 1px solid var(--boc-geo-border);
        background: rgba(12, 17, 22, 0.92);
      }

      .boc-native-nav button {
        appearance: none;
        border: 1px solid transparent;
        background: transparent;
        color: var(--boc-geo-text);
        border-radius: 7px;
        padding: 8px 10px;
        font-size: 11px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s ease, border-color 0.15s ease;
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .boc-native-nav button.active {
        background: rgba(94, 169, 255, 0.13);
        border-color: rgba(94, 169, 255, 0.42);
        box-shadow: inset 0 0 0 1px rgba(94, 169, 255, 0.18);
      }

      .boc-native-content {
        flex: 1;
        overflow-y: auto;
        padding: 12px;
        scrollbar-width: thin;
        scrollbar-color: rgba(120, 150, 181, 0.5) transparent;
      }

      .boc-native-content::-webkit-scrollbar {
        width: 8px;
      }

      .boc-native-content::-webkit-scrollbar-thumb {
        background: rgba(120, 150, 181, 0.45);
        border-radius: 999px;
      }

      .boc-native-section {
        display: grid;
        gap: 12px;
      }

      .boc-native-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }

      .boc-native-stat,
      .boc-native-card,
      .boc-native-chat-item,
      .boc-native-list-item,
      .boc-native-row,
      .boc-native-matrix {
        background: linear-gradient(180deg, rgba(29, 38, 47, 0.9), rgba(18, 22, 28, 0.96));
        border: 1px solid var(--boc-geo-border);
        border-radius: 10px;
      }

      .boc-native-stat,
      .boc-native-card {
        padding: 10px 12px;
      }

      .boc-native-stat-label {
        font-size: 9px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--boc-geo-text-soft);
        margin-bottom: 6px;
      }

      .boc-native-stat-value {
        font-size: 18px;
        font-weight: 700;
      }

      .boc-native-card h3,
      .boc-native-card h4 {
        margin: 0 0 10px;
        font-size: 10px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--boc-geo-text-soft);
      }

      .boc-native-list {
        display: grid;
        gap: 8px;
      }

      .boc-native-list-item,
      .boc-native-chat-item,
      .boc-native-row {
        padding: 8px 10px;
      }

      .boc-native-list-item,
      .boc-native-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 8px;
      }

      .boc-native-chat-item {
        display: grid;
        gap: 5px;
      }

      .boc-native-chat-meta {
        display: flex;
        justify-content: space-between;
        gap: 8px;
        color: var(--boc-geo-text-soft);
        font-size: 10px;
      }

      .boc-native-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 4px 8px;
        border-radius: 999px;
        border: 1px solid var(--boc-geo-border);
        font-size: 9px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        white-space: nowrap;
      }

      .boc-native-badge.green { background: rgba(70, 211, 157, 0.12); color: var(--boc-geo-green); }
      .boc-native-badge.blue { background: rgba(94, 169, 255, 0.12); color: var(--boc-geo-blue); }
      .boc-native-badge.yellow { background: rgba(241, 198, 106, 0.12); color: var(--boc-geo-yellow); }
      .boc-native-badge.orange { background: rgba(255, 178, 102, 0.12); color: var(--boc-geo-orange); }
      .boc-native-badge.red { background: rgba(255, 127, 127, 0.12); color: var(--boc-geo-red); }
      .boc-native-badge.purple { background: rgba(178, 154, 252, 0.12); color: var(--boc-geo-purple); }

      .boc-native-channel,
      .boc-native-search,
      .boc-native-button-row,
      .boc-native-select {
        width: 100%;
        box-sizing: border-box;
      }

      .boc-native-channel,
      .boc-native-search,
      .boc-native-select {
        background: rgba(9, 13, 18, 0.86);
        border: 1px solid var(--boc-geo-border);
        border-radius: 8px;
        color: var(--boc-geo-text);
        padding: 8px 10px;
      }

      .boc-native-button-row {
        background: rgba(94, 169, 255, 0.12);
        border: 1px solid rgba(94, 169, 255, 0.28);
        border-radius: 8px;
        color: var(--boc-geo-text);
        padding: 8px 10px;
        cursor: pointer;
      }

      .boc-native-message-layout {
        display: grid;
        grid-template-columns: 120px 1fr;
        gap: 10px;
      }

      .boc-native-chat-list,
      .boc-native-member-list {
        display: grid;
        gap: 8px;
      }

      .boc-native-channel-item,
      .boc-native-member-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        padding: 8px 8px;
        border-radius: 8px;
        border: 1px solid var(--boc-geo-border);
        background: rgba(10, 15, 20, 0.8);
      }

      .boc-native-unread {
        min-width: 18px;
        height: 18px;
        border-radius: 999px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(94, 169, 255, 0.18);
        color: var(--boc-geo-blue);
        font-size: 9px;
        font-weight: 700;
      }

      table {
        width: 100%;
        border-collapse: collapse;
      }

      th, td {
        padding: 7px 6px;
        border-bottom: 1px solid rgba(141, 163, 190, 0.12);
        text-align: left;
      }

      th {
        color: var(--boc-geo-text-soft);
        font-size: 9px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }

      .boc-native-empty {
        color: var(--boc-geo-text-soft);
        font-size: 12px;
      }

      @media (max-width: 700px) {
        .boc-native-panel {
          width: min(84vw, 340px);
        }
      }
    `;
  }

  function injectCss() {
    if (document.getElementById('boc-native-geo-styles')) {
      return;
    }

    const style = document.createElement('style');
    style.id = 'boc-native-geo-styles';
    style.type = 'text/css';
    style.textContent = buildCss();
    document.head.appendChild(style);
  }

  function renderDashboard() {
    return `
      <div class="boc-native-section">
        <div class="boc-native-grid">
          <div class="boc-native-stat"><div class="boc-native-stat-label">Members</div><div class="boc-native-stat-value">42</div></div>
          <div class="boc-native-stat"><div class="boc-native-stat-label">Server</div><div class="boc-native-stat-value">BATS</div></div>
          <div class="boc-native-stat"><div class="boc-native-stat-label">Ops</div><div class="boc-native-stat-value">Nominal</div></div>
          <div class="boc-native-stat"><div class="boc-native-stat-label">Alerts</div><div class="boc-native-stat-value">03</div></div>
        </div>

        <div class="boc-native-card">
          <h3>Mission Board</h3>
          <div class="boc-native-list">
            <div class="boc-native-list-item"><div><strong>Operation Atlas</strong><br><small>North Corridor</small></div><span class="boc-native-badge green">Live</span></div>
            <div class="boc-native-list-item"><div><strong>Training Squadron 7</strong><br><small>Bravo Range</small></div><span class="boc-native-badge yellow">Queued</span></div>
            <div class="boc-native-list-item"><div><strong>Intel Sweep</strong><br><small>Metro Sector</small></div><span class="boc-native-badge orange">Monitoring</span></div>
          </div>
        </div>
      </div>
    `;
  }

  function renderBafChat() {
    const channels = [
      { name: '#operations', unread: 0 },
      { name: '#training', unread: 0 },
      { name: '#intel', unread: 0 },
      { name: '#admin', unread: 0 }
    ];

    const bats = getBatsSnapshot();
    const members = bats.pilots.slice(0, 4).map(function (pilot) {
      return { name: escapeHtml(pilot.username || pilot.callsign || 'Unknown'), role: escapeHtml(pilot.group || pilot.status || 'member') };
    });

    const history = [
      { user: 'BOC', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), msg: bats.connected ? 'BOC connected to the live BATS data stream.' : 'BOC is waiting for a live BATS connection.', badge: bats.connected ? 'green' : 'red' },
      { user: 'SERVER', time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }), msg: 'Persistent relay endpoint ready for live updates.', badge: 'blue' }
    ];

    return `
      <div class="boc-native-section">
        <div class="boc-native-card">
          <h3>BAF Chat</h3>
          <div class="boc-native-message-layout">
            <div class="boc-native-chat-list">
              ${channels.map(function (channel) {
                return `
                  <div class="boc-native-channel-item">
                    <span>${escapeHtml(channel.name)}</span>
                    <span class="boc-native-unread">${channel.unread}</span>
                  </div>
                `;
              }).join('')}
            </div>
            <div class="boc-native-member-list">
              ${members.length ? members.map(function (member) {
                return `
                  <div class="boc-native-member-item">
                    <span>${member.name}</span>
                    <small>${member.role}</small>
                  </div>
                `;
              }).join('') : '<div class="boc-native-empty">No online members</div>'}
            </div>
          </div>
        </div>

        <div class="boc-native-card">
          <h3>Message History</h3>
          <div class="boc-native-list">
            ${history.map(function (item) {
              return `
                <div class="boc-native-chat-item">
                  <div class="boc-native-chat-meta">
                    <strong>${escapeHtml(item.user)}</strong>
                    <span>${escapeHtml(item.time)}</span>
                  </div>
                  <div>${escapeHtml(item.msg)}</div>
                  <span class="boc-native-badge ${item.badge}">${item.user === 'SERVER' ? 'Relay' : 'Status'}</span>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      </div>
    `;
  }

  function renderMiniRadar() {
    const bats = getBatsSnapshot();
    const pilots = bats.pilots.length ? bats.pilots : [];
    const rowItems = pilots.length ? pilots.map(function (pilot) {
      const callsign = escapeHtml(pilot.callsign || pilot.username || 'Unknown');
      const altitude = escapeHtml(pilot.altitude || pilot.alt || 'N/A');
      const heading = escapeHtml(pilot.heading || pilot.course || 'N/A');
      const tag = String(pilot.group || pilot.team || pilot.status || 'All');
      const badgeClass = tag.toLowerCase().indexOf('baf') !== -1 ? 'green' : tag.toLowerCase().indexOf('training') !== -1 ? 'yellow' : tag.toLowerCase().indexOf('ops') !== -1 || tag.toLowerCase().indexOf('operations') !== -1 ? 'orange' : 'blue';
      return `
        <div class="boc-native-list-item">
          <div><strong>${callsign}</strong><br><small>${altitude} • ${heading}</small></div>
          <span class="boc-native-badge ${badgeClass}">${escapeHtml(tag)}</span>
        </div>
      `;
    }).join('') : '<div class="boc-native-empty">No live BATS aircraft</div>';

    return `
      <div class="boc-native-section">
        <div class="boc-native-card">
          <h3>Radar</h3>
          <div class="boc-native-list-item" style="margin-bottom: 10px;"><span><strong>${escapeHtml(bats.status)}</strong></span><span class="boc-native-badge ${bats.connected ? 'green' : 'red'}">${bats.connected ? 'LIVE' : 'OFFLINE'}</span></div>
          <input class="boc-native-search" type="text" placeholder="Search callsign/username" />
          <div style="margin-top: 8px; display: grid; gap: 8px;">
            <select class="boc-native-select">
              <option>All</option>
              <option>BAF</option>
              <option>Training</option>
              <option>Operations</option>
            </select>
          </div>
          <div class="boc-native-list" style="margin-top: 10px;">
            ${rowItems}
          </div>
        </div>
      </div>
    `;
  }

  function renderPilots() {
    return `
      <div class="boc-native-card">
        <h3>Active BAF Pilots</h3>
        <table>
          <thead>
            <tr><th>User</th><th>Callsign</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr><td>MARA</td><td>BAF-14</td><td><span class="boc-native-badge green">Online</span></td></tr>
            <tr><td>KAI</td><td>TRN-02</td><td><span class="boc-native-badge yellow">Training</span></td></tr>
            <tr><td>ORBIT</td><td>OPS-01</td><td><span class="boc-native-badge orange">Ops</span></td></tr>
          </tbody>
        </table>
      </div>
    `;
  }

  function renderOperations() {
    return `
      <div class="boc-native-card">
        <h3>Operations</h3>
        <div class="boc-native-list">
          <div class="boc-native-list-item"><div><strong>Operation Atlas</strong><br><small>North Corridor</small></div><span class="boc-native-badge green">Live</span></div>
          <div class="boc-native-list-item"><div><strong>Training Squadron 7</strong><br><small>Bravo Range</small></div><span class="boc-native-badge yellow">Queued</span></div>
          <div class="boc-native-list-item"><div><strong>Intel Sweep</strong><br><small>Metro Sector</small></div><span class="boc-native-badge blue">Monitoring</span></div>
        </div>
      </div>
    `;
  }

  function renderAlerts() {
    return `
      <div class="boc-native-card">
        <h3>Alerts</h3>
        <div class="boc-native-list">
          <div class="boc-native-list-item"><div><strong>BAF Online</strong><br><small>Server confirmed</small></div><span class="boc-native-badge green">Green</span></div>
          <div class="boc-native-list-item"><div><strong>BAF Notice</strong><br><small>Ops update posted</small></div><span class="boc-native-badge blue">Blue</span></div>
          <div class="boc-native-list-item"><div><strong>Training Queue</strong><br><small>Queue update</small></div><span class="boc-native-badge yellow">Yellow</span></div>
          <div class="boc-native-list-item"><div><strong>Operation Start</strong><br><small>North corridor active</small></div><span class="boc-native-badge orange">Orange</span></div>
          <div class="boc-native-list-item"><div><strong>Admin Notice</strong><br><small>Critical review required</small></div><span class="boc-native-badge red">Red</span></div>
        </div>
      </div>
    `;
  }

  function renderLogs() {
    return `
      <div class="boc-native-card">
        <h3>Logs</h3>
        <div class="boc-native-list">
          <div class="boc-native-list-item"><div><strong>Chat Log</strong><br><small>12:11Z • #operations</small></div><span class="boc-native-badge green">Saved</span></div>
          <div class="boc-native-list-item"><div><strong>Ops Log</strong><br><small>12:18Z • Atlas</small></div><span class="boc-native-badge blue">Saved</span></div>
          <div class="boc-native-list-item"><div><strong>Pilot Log</strong><br><small>12:24Z • BAF-14</small></div><span class="boc-native-badge purple">Tracked</span></div>
        </div>
        <div style="display: grid; gap: 8px; margin-top: 12px;">
          <button type="button" class="boc-native-button-row">Export JSON</button>
          <button type="button" class="boc-native-button-row">Export CSV</button>
        </div>
      </div>
    `;
  }

  function renderSettings() {
    return `
      <div class="boc-native-card">
        <h3>Settings</h3>
        <div class="boc-native-list">
          <label class="boc-native-list-item"><span>Enable BAF Chat</span><input type="checkbox" checked /></label>
          <label class="boc-native-list-item"><span>Enable Radar</span><input type="checkbox" checked /></label>
          <label class="boc-native-list-item"><span>Enable Alerts</span><input type="checkbox" checked /></label>
          <label class="boc-native-list-item"><span>Enable Tracking</span><input type="checkbox" checked /></label>
          <label class="boc-native-list-item"><span>Dark Mode</span><input type="checkbox" checked /></label>
          <label class="boc-native-list-item"><span>Compact Mode</span><input type="checkbox" /></label>
        </div>
      </div>
    `;
  }

  function renderSection(section) {
    const map = {
      Dashboard: renderDashboard(),
      'BAF Chat': renderBafChat(),
      'Mini Radar': renderMiniRadar(),
      'Active BAF Pilots': renderPilots(),
      Operations: renderOperations(),
      Alerts: renderAlerts(),
      Logs: renderLogs(),
      Settings: renderSettings()
    };
    return map[section] || renderDashboard();
  }

  function setPanelOpen(isOpen) {
    const panel = document.getElementById('boc-native-panel');
    const left = document.querySelector('.geofs-ui-left');
    if (!panel) return;
    panel.classList.toggle('open', !!isOpen);
    panel.setAttribute('data-open', !!isOpen ? 'true' : 'false');
    if (left) {
      left.classList.toggle('boc-module-open', !!isOpen);
    }

    const button = document.getElementById('boc-module-button');
    if (button) {
      button.classList.toggle('active', !!isOpen);
      button.setAttribute('aria-expanded', !!isOpen ? 'true' : 'false');
    }
  }

  function syncButtonState() {
    const button = document.getElementById('boc-module-button');
    if (!button) return;
    button.classList.toggle('active', !!state.open);
    button.setAttribute('aria-expanded', !!state.open ? 'true' : 'false');
  }

  function render() {
    const panel = document.getElementById('boc-native-panel');
    if (!panel) return;

    const nav = panel.querySelector('.boc-native-nav');
    const content = panel.querySelector('.boc-native-content');
    if (!nav || !content) return;

    nav.innerHTML = SECTION_LIST.map(function (section) {
      return '<button type="button" class="' + (section === state.section ? 'active' : '') + '" data-section="' + section + '">' + section + '</button>';
    }).join('');

    content.innerHTML = renderSection(state.section);

    nav.querySelectorAll('[data-section]').forEach(function (button) {
      button.addEventListener('click', function () {
        state.section = button.getAttribute('data-section');
        saveState();
        render();
      });
    });

    setPanelOpen(state.open);
    syncButtonState();
  }

  function closeLegacyBocUi() {
    document.querySelectorAll('.boc-sidebar, .boc-client-toast, .boc-floating-window, .boc-draggable-window').forEach(function (el) {
      el.remove();
    });
  }

  function buildPanel() {
    const panel = document.createElement('aside');
    panel.id = 'boc-native-panel';
    panel.className = 'boc-native-panel' + (state.open ? ' open' : '');
    panel.setAttribute('role', 'complementary');
    panel.setAttribute('aria-label', 'BOC panel');
    panel.innerHTML = `
      <header class="boc-native-header">
        <div class="boc-native-brand">
          <span class="boc-native-mark">BOC</span>
          <div>
            <div class="boc-native-title">BOC</div>
            <div class="boc-native-subtitle">BAF Ops</div>
          </div>
        </div>
        <button type="button" class="boc-native-close" aria-label="Close BOC">✕</button>
      </header>
      <nav class="boc-native-nav" aria-label="BOC sections"></nav>
      <div class="boc-native-content"></div>
    `;

    const closeButton = panel.querySelector('.boc-native-close');
    closeButton.addEventListener('click', function () {
      state.open = false;
      saveState();
      setPanelOpen(false);
    });

    return panel;
  }

  function findLeftRail() {
    return document.querySelector('.geofs-ui-left, #geofs-ui-left');
  }

  function findToolbar() {
    return document.querySelector('.geofs-ui-bottom, #geofs-ui-bottom, .geofs-bottom-bar, .geofs-ui-bottom-bar');
  }

  function attachPanelToGeoFs() {
    const left = findLeftRail();
    if (!left) return false;

    closeLegacyBocUi();

    let panel = left.querySelector('#boc-native-panel');
    if (!panel) {
      panel = buildPanel();
      left.appendChild(panel);
    }

    render();
    return true;
  }

  function injectToolbarButton() {
    const toolbar = findToolbar();
    if (!toolbar) return false;

    let button = document.getElementById('boc-module-button');
    if (!button) {
      button = document.createElement('button');
      button.id = 'boc-module-button';
      button.type = 'button';
      button.className = 'mdl-button mdl-js-button geofs-f-standard-ui boc-native-button';
      button.setAttribute('aria-label', 'BOC operations panel');
      button.setAttribute('data-toggle-panel', '#boc-native-panel');
      button.setAttribute('data-tooltip-classname', 'mdl-tooltip--top');
      button.setAttribute('title', 'Toggle BOC panel');
      button.innerHTML = '<i class="material-icons">security</i><span>BOC</span>';
      button.style.display = 'inline-flex';
      button.style.visibility = 'visible';
      button.style.opacity = '1';
      button.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        state.open = !state.open;
        saveState();
        setPanelOpen(state.open);
      });

      const candidateButtons = Array.from(toolbar.querySelectorAll('button'));
      const referenceNode = candidateButtons.length ? candidateButtons[candidateButtons.length - 1] : null;
      if (referenceNode && referenceNode.parentNode) {
        referenceNode.parentNode.insertBefore(button, referenceNode.nextSibling);
      } else {
        toolbar.appendChild(button);
      }
    }
    syncButtonState();
    return true;
  }

  let uiRetryTimer = null;
  let uiAttachAttempts = 0;

  function handleUiRebuild() {
    const left = findLeftRail();
    const bottom = findToolbar();

    if (bottom && !document.getElementById('boc-module-button')) {
      injectToolbarButton();
    }
    if (left) {
      attachPanelToGeoFs();
    }
  }

  function scheduleUiRetry() {
    if (uiRetryTimer) return;

    uiAttachAttempts = 0;
    uiRetryTimer = setInterval(function () {
      uiAttachAttempts += 1;
      handleUiRebuild();

      if (uiAttachAttempts >= 3) {
        clearInterval(uiRetryTimer);
        uiRetryTimer = null;
      }
    }, 2000);
  }

  function init() {
    if (!document.body) return;
    if (!findLeftRail() && !findToolbar()) {
      return;
    }

    document.body.classList.add('boc-geo-module-active');
    injectCss();
    handleUiRebuild();
    scheduleUiRetry();

    const bats = getWindowBats();
    if (bats && typeof bats.sendEvent === 'function') {
      bats.sendEvent('BOC_CLIENT_READY', { source: 'GeoFS-BOC', timestamp: Date.now() });
    }
    relayToServer('boc_client_ready', { status: 'ready', source: 'GeoFS-BOC' });

    document.addEventListener('click', function (event) {
      const panel = document.getElementById('boc-native-panel');
      const button = document.getElementById('boc-module-button');
      if (!panel || !button || panel.classList.contains('open') === false) return;
      const insidePanel = panel.contains(event.target);
      const insideButton = button.contains(event.target);
      if (!insidePanel && !insideButton) {
        state.open = false;
        saveState();
        setPanelOpen(false);
      }
    });

    document.addEventListener('keydown', function (event) {
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        state.open = !state.open;
        saveState();
        setPanelOpen(state.open);
      }
    });

    const root = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    root.BOC = root.BOC || {
      version: '4.0.0',
      state: function () { return state; },
      setSection: function (section) {
        if (SECTION_LIST.indexOf(section) !== -1) {
          state.section = section;
          saveState();
          render();
        }
      },
      toggleSidebar: function () {
        state.open = !state.open;
        saveState();
        setPanelOpen(state.open);
      }
    };

    root.BATS = root.BATS || {
      modules: {},
      registerModule: function (name, module) {
        this.modules[name] = module;
        return module;
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
