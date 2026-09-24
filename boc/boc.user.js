// ==UserScript==
// @name         BOC - BAF Operations Client
// @namespace    https://github.com/Belgiantech-baf/belgian-advanced-technological-system
// @version      1.0.0
// @description  In-session communications, chat awareness, moderation, and local operations tooling for BAF personnel in GeoFS.
// @author       BATS / Belgian Advanced Technology System
// @match        https://www.geo-fs.com/*
// @match        https://geo-fs.com/*
// @run-at       document-start
// @grant        GM_registerMenuCommand
// @grant        GM_download
// @grant        GM_notification
// ==/UserScript==

(function () {
  'use strict';

  const STORAGE_KEY = 'boc.config.v1';
  const LOG_KEY = 'boc.activity.v1';
  const MAX_LOG = 2000;
  const TAG_RULES = [
    { tag: '[ADMIN]', category: 'red' },
    { tag: '[ALERT]', category: 'red' },
    { tag: '[OPS]', category: 'yellow' },
    { tag: '[MISSION]', category: 'yellow' },
    { tag: '[TRAINING]', category: 'blue' },
    { tag: '[BAF]', category: 'blue' },
  ];
  const DEFAULT_CONFIG = {
    enabled: true,
    logging: true,
    relayEnabled: true,
    filtersEnabled: true,
    darkMode: true,
    panel: { left: 18, top: 82, width: 430, height: 620 },
    tags: ['[BAF]', '[OPS]', '[ALERT]', '[TRAINING]', '[ADMIN]'],
    squadronTags: [],
    authorizedPatterns: [],
    muteUsers: [],
    watchlist: [],
    relayEndpoints: [{ name: 'BATS Discord log channel', url: 'https://geofs-live-radar.onrender.com/api/boc/log', enabled: true }],
    channelName: 'BAF Operations',
  };

  const state = {
    config: loadConfig(),
    log: loadLog(),
    pilots: new Map(),
    messages: [],
    alerts: [],
    activePanel: 'chat',
    search: '',
    minimized: false,
    panel: null,
    startedAt: Date.now(),
  };

  function loadConfig() {
    try {
      const config = merge(DEFAULT_CONFIG, JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
      if (!config.relayEndpoints.length) {
        config.relayEndpoints = [...DEFAULT_CONFIG.relayEndpoints];
        config.relayEnabled = true;
      }
      return config;
    } catch (error) {
      console.warn('[BOC] Configuration reset:', error);
      return structuredClone(DEFAULT_CONFIG);
    }
  }

  function loadLog() {
    try {
      const value = JSON.parse(localStorage.getItem(LOG_KEY) || '[]');
      return Array.isArray(value) ? value.slice(-MAX_LOG) : [];
    } catch (_) {
      return [];
    }
  }

  function merge(base, override) {
    const result = { ...base, ...override };
    for (const key of Object.keys(base)) {
      if (base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) {
        result[key] = { ...base[key], ...(override[key] || {}) };
      }
    }
    return result;
  }

  function saveConfig() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
  }

  function persistLog() {
    state.log = state.log.slice(-MAX_LOG);
    localStorage.setItem(LOG_KEY, JSON.stringify(state.log));
  }

  function now() {
    return new Date().toISOString();
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[character]));
  }

  function categoryFor(message) {
    if (!state.config.filtersEnabled) return 'green';
    const text = String(message.message || '').toUpperCase();
    const custom = TAG_RULES.filter((rule) => state.config.tags.includes(rule.tag));
    const rule = [...custom, ...state.config.squadronTags.map((tag) => ({ tag, category: 'blue' }))]
      .find((candidate) => text.includes(String(candidate.tag).toUpperCase()));
    return rule ? rule.category : 'green';
  }

  function isBafPilot(pilot) {
    const haystack = `${pilot.username} ${pilot.callsign}`.toUpperCase();
    return state.config.tags.some((tag) => haystack.includes(String(tag).toUpperCase()))
      || state.config.squadronTags.some((tag) => haystack.includes(String(tag).toUpperCase()))
      || state.config.authorizedPatterns.some((pattern) => {
        try { return new RegExp(pattern, 'i').test(haystack); } catch (_) { return false; }
      });
  }

  function addActivity(type, data) {
    const entry = { id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`, type, timestamp: now(), ...data };
    if (!state.config.logging) return entry;
    state.log.push(entry);
    persistLog();
    console.debug('[BOC]', type, data);
    if (!type.startsWith('relay-')) Relay.sendLog(entry);
    return entry;
  }

  function normalizeMessage(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const message = raw.message ?? raw.content ?? raw.text ?? raw.body;
    if (typeof message !== 'string' || !message.trim()) return null;
    const username = String(raw.username ?? raw.user ?? raw.name ?? raw.callsign ?? 'unknown').trim();
    const callsign = String(raw.callsign ?? raw.cs ?? username).trim();
    return {
      id: String(raw.id ?? raw.messageId ?? `${username}|${message}|${raw.timestamp ?? raw.time ?? ''}`),
      username,
      callsign,
      message: message.trim(),
      timestamp: raw.timestamp ?? raw.time ?? now(),
      server: String(raw.server ?? raw.room ?? raw.serverId ?? 'unknown'),
    };
  }

  function processChat(raw) {
    const message = normalizeMessage(raw);
    if (!message || state.messages.some((item) => item.id === message.id)) return;
    if (state.config.muteUsers.some((user) => user.toLowerCase() === message.username.toLowerCase())) return;
    message.category = categoryFor(message);
    state.messages.push(message);
    state.messages = state.messages.slice(-300);
    addActivity('chat', message);
    if (isBafPilot(message)) {
      state.pilots.set(message.username, { ...state.pilots.get(message.username), username: message.username, callsign: message.callsign, lastSeen: message.timestamp, server: message.server });
      addActivity('pilot-detected', { username: message.username, callsign: message.callsign, server: message.server });
    }
    if (message.category === 'red' || message.category === 'yellow') {
      state.alerts.unshift(message);
      state.alerts = state.alerts.slice(0, 100);
      addActivity('alert', { messageId: message.id, category: message.category });
    }
    render();
  }

  function extractMessages(payload) {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    for (const key of ['chat', 'messages', 'chatMessages', 'chatLog']) {
      if (Array.isArray(payload[key])) return payload[key];
      if (payload[key] && Array.isArray(payload[key].messages)) return payload[key].messages;
    }
    return [];
  }

  function inspectPayload(payload) {
    extractMessages(payload).forEach(processChat);
    if (payload && Array.isArray(payload.users)) {
      payload.users.forEach((user) => {
        const username = user.username ?? user.name ?? user.cs;
        if (!username) return;
        const pilot = { username: String(username), callsign: String(user.cs ?? username), server: String(user.server ?? 'unknown'), aircraft: String(user.aircraft ?? user.ac ?? 'unknown'), lastSeen: now() };
        if (isBafPilot(pilot)) state.pilots.set(pilot.username, pilot);
      });
      render();
    }
  }

  const Relay = {
    async sendLog(entry) {
      if (!state.config.relayEnabled || !state.config.relayEndpoints.length) return;
      const approved = state.config.relayEndpoints.filter((endpoint) => endpoint.enabled && /^https:\/\//i.test(endpoint.url));
      for (const endpoint of approved) {
        try {
          addActivity('relay-attempt', { endpoint: endpoint.name || endpoint.url, messageId: entry.id });
          const response = await fetch(endpoint.url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'BOC', channel: state.config.channelName, ...entry }) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          addActivity('relay-sent', { endpoint: endpoint.name || endpoint.url, messageId: entry.id });
        } catch (error) {
          addActivity('relay-failed', { endpoint: endpoint.name || endpoint.url, messageId: entry.id, error: String(error.message || error) });
          console.warn('[BOC] Relay unavailable; message retained locally.', error);
        }
      }
    },
  };

  function hookNetwork() {
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      try { response.clone().json().then(inspectPayload).catch(() => {}); } catch (_) { /* non-JSON response */ }
      return response;
    };
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url, ...rest) { this._bocUrl = String(url); return originalOpen.call(this, method, url, ...rest); };
    XMLHttpRequest.prototype.send = function (...args) {
      this.addEventListener('load', () => {
        try { inspectPayload(JSON.parse(this.responseText)); } catch (_) { /* non-JSON response */ }
      });
      return originalSend.apply(this, args);
    };
  }

  function listenDomChat() {
    const selectors = ['[class*="chat"]', '[id*="chat"]'];
    const observer = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE) return;
      const element = node.matches?.(selectors.join(',')) ? node : node.querySelector?.(selectors.join(','));
      if (!element) return;
      const text = element.textContent?.trim();
      if (text && text.length < 1000) processChat({ username: 'GeoFS', message: text, timestamp: now(), server: 'DOM' });
    })));
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  const UI = {
    panel(title, key, content) {
      return `<section class="boc-panel boc-${key}"><header><span>${title}</span><div><button data-action="minimize" title="Minimize">-</button></div></header><div class="boc-panel-body">${content}</div></section>`;
    },
    tabs() {
      return ['chat', 'channel', 'ops', 'pilots', 'alerts', 'settings'].map((tab) => `<button class="boc-tab ${state.activePanel === tab ? 'active' : ''}" data-tab="${tab}">${tab === 'chat' ? 'Chat Monitor' : tab === 'ops' ? 'Operations Feed' : tab === 'pilots' ? 'Active BAF Pilots' : tab === 'alerts' ? 'Alert Console' : tab === 'channel' ? 'BAF Channel' : 'Settings'}</button>`).join('');
    },
  };

  function renderContent() {
    if (state.activePanel === 'chat') {
      const query = state.search.trim().toLowerCase();
      const messages = state.messages.filter((message) => !query || `${message.username} ${message.callsign} ${message.message}`.toLowerCase().includes(query));
      return `<input class="boc-search" id="boc-search" placeholder="Search chat, callsign, or user" value="${escapeHtml(state.search)}">${messages.slice(-80).reverse().map(messageRow).join('') || empty('Waiting for matching GeoFS chat traffic')}`;
    }
    if (state.activePanel === 'channel') return `<div class="boc-channel-head"><strong># ${escapeHtml(state.config.channelName)}</strong><span>Internal local channel</span></div><textarea id="boc-channel-input" placeholder="Compose a local BAF update..."></textarea><button class="boc-primary" data-action="post-local">Post update</button>${state.messages.filter((message) => isBafPilot(message)).slice(-50).reverse().map(messageRow).join('') || empty('No BAF messages yet')}`;
    if (state.activePanel === 'ops') return state.log.slice(-80).reverse().map((entry) => `<div class="boc-log-row"><time>${escapeHtml(new Date(entry.timestamp).toLocaleTimeString())}</time><b>${escapeHtml(entry.type)}</b><span>${escapeHtml(entry.username || entry.endpoint || entry.messageId || '')}</span></div>`).join('') || empty('No operations recorded');
    if (state.activePanel === 'pilots') return [...state.pilots.values()].sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen))).map((pilot) => `<div class="boc-pilot"><i class="boc-dot"></i><div><strong>${escapeHtml(pilot.callsign || pilot.username)}</strong><span>${escapeHtml(pilot.username)} · ${escapeHtml(pilot.aircraft || 'aircraft unknown')}</span></div><time>${escapeHtml(new Date(pilot.lastSeen).toLocaleTimeString())}</time></div>`).join('') || empty('No configured BAF pilots seen');
    if (state.activePanel === 'alerts') return state.alerts.map(messageRow).join('') || empty('No alerts in this session');
    return settingsView();
  }

  function messageRow(message) {
    return `<article class="boc-message ${escapeHtml(message.category || 'green')}"><div class="boc-message-meta"><strong>${escapeHtml(message.username)}</strong><span>${escapeHtml(message.callsign)}</span><time>${escapeHtml(new Date(message.timestamp).toLocaleTimeString())}</time></div><p>${escapeHtml(message.message)}</p><small>${escapeHtml(message.server)}</small></article>`;
  }

  function empty(text) { return `<div class="boc-empty">${escapeHtml(text)}</div>`; }

  function settingsView() {
    return `<div class="boc-settings"><label><input type="checkbox" data-setting="logging" ${state.config.logging ? 'checked' : ''}> Local activity logging</label><label><input type="checkbox" data-setting="relayEnabled" ${state.config.relayEnabled ? 'checked' : ''}> Enable configured relay endpoints</label><label><input type="checkbox" data-setting="filtersEnabled" ${state.config.filtersEnabled ? 'checked' : ''}> Color-coded tag filters</label><label>BAF tags<input data-setting="tags" value="${escapeHtml(state.config.tags.join(', '))}"></label><label>Squadron tags<input data-setting="squadronTags" value="${escapeHtml(state.config.squadronTags.join(', '))}"></label><label>Authorized callsign patterns<input data-setting="authorizedPatterns" value="${escapeHtml(state.config.authorizedPatterns.join(', '))}"></label><label>Muted users<input data-setting="muteUsers" value="${escapeHtml(state.config.muteUsers.join(', '))}"></label><label>Approved HTTPS relay URLs<input id="boc-relays" value="${escapeHtml(state.config.relayEndpoints.map((endpoint) => endpoint.url).join(', '))}"></label><div class="boc-setting-actions"><button data-action="save-relays">Save relay URLs</button><button data-action="export">Export JSON</button><button data-action="clear-log">Clear activity</button><button data-action="theme">Toggle theme</button></div><p class="boc-safety">Relays are off by default. Only HTTPS endpoints explicitly added to local settings are used. No credentials are stored by BOC.</p></div>`;
  }

  function render() {
    if (!state.panel) return;
    state.panel.innerHTML = `<div class="boc-shell ${state.config.darkMode ? 'dark' : 'light'} ${state.minimized ? 'is-minimized' : ''}"><div class="boc-titlebar"><strong>BOC <span>BAF Operations Client</span></strong><div><button data-action="theme" title="Toggle theme">◐</button><button data-action="minimize" title="Minimize">-</button><button data-action="close" title="Close">×</button></div></div><div class="boc-status"><i class="boc-dot"></i> GeoFS session active <span>${state.messages.length} messages</span><span>${state.pilots.size} BAF pilots</span></div><nav>${UI.tabs()}</nav><main>${renderContent()}</main><footer><span>Local activity: ${state.log.length}</span><button data-action="export">Export log</button></footer></div>`;
    bindUi();
  }

  function bindUi() {
    state.panel.querySelectorAll('[data-tab]').forEach((button) => button.onclick = () => { state.activePanel = button.dataset.tab; render(); });
    state.panel.querySelectorAll('[data-action="minimize"]').forEach((button) => button.onclick = () => { state.minimized = !state.minimized; render(); });
    state.panel.querySelectorAll('[data-action="close"]').forEach((button) => button.onclick = () => { state.panel.remove(); state.panel = null; });
    state.panel.querySelectorAll('[data-action="theme"]').forEach((button) => button.onclick = () => { state.config.darkMode = !state.config.darkMode; saveConfig(); render(); });
    state.panel.querySelectorAll('[data-action="export"]').forEach((button) => button.onclick = exportLog);
    state.panel.querySelectorAll('[data-action="clear-log"]').forEach((button) => button.onclick = () => { state.log = []; persistLog(); render(); });
    const search = state.panel.querySelector('#boc-search');
    if (search) search.oninput = () => { state.search = search.value; render(); const next = state.panel.querySelector('#boc-search'); next?.focus(); next?.setSelectionRange(state.search.length, state.search.length); };
    const saveRelays = state.panel.querySelector('[data-action="save-relays"]');
    if (saveRelays) saveRelays.onclick = () => {
      const values = state.panel.querySelector('#boc-relays').value.split(',').map((value) => value.trim()).filter((value) => /^https:\/\//i.test(value));
      state.config.relayEndpoints = values.map((url) => ({ name: url, url, enabled: true }));
      saveConfig();
      addActivity('configuration', { setting: 'relayEndpoints', count: values.length });
      render();
    };
    const post = state.panel.querySelector('[data-action="post-local"]');
    if (post) post.onclick = () => { const input = state.panel.querySelector('#boc-channel-input'); if (input?.value.trim()) { processChat({ username: 'You', callsign: 'BAF', message: `[BAF] ${input.value.trim()}`, timestamp: now(), server: 'BOC Local' }); input.value = ''; } };
    state.panel.querySelectorAll('[data-setting]').forEach((input) => input.onchange = () => {
      const key = input.dataset.setting;
      state.config[key] = input.type === 'checkbox' ? input.checked : input.value.split(',').map((value) => value.trim()).filter(Boolean);
      saveConfig();
      render();
    });
  }

  function exportLog() {
    const payload = JSON.stringify({ exportedAt: now(), source: 'BOC', entries: state.log }, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    if (typeof GM_download === 'function') GM_download({ url, name: `boc-activity-${new Date().toISOString().slice(0, 10)}.json`, saveAs: true });
    else { const anchor = document.createElement('a'); anchor.href = url; anchor.download = 'boc-activity.json'; anchor.click(); }
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function makeDraggable(panel) {
    let drag = null;
    panel.addEventListener('pointerdown', (event) => {
      const titlebar = event.target.closest('.boc-titlebar');
      if (!titlebar || event.target.closest('button')) return;
      drag = { x: event.clientX - panel.offsetLeft, y: event.clientY - panel.offsetTop };
      panel.setPointerCapture(event.pointerId);
    });
    panel.addEventListener('pointermove', (event) => { if (drag) { panel.style.left = `${Math.max(0, event.clientX - drag.x)}px`; panel.style.top = `${Math.max(0, event.clientY - drag.y)}px`; } });
    panel.addEventListener('pointerup', () => { if (!drag) return; state.config.panel.left = panel.offsetLeft; state.config.panel.top = panel.offsetTop; saveConfig(); drag = null; });
  }

  function mount() {
    if (state.panel || !state.config.enabled) return;
    const style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);
    state.panel = document.createElement('div');
    state.panel.id = 'boc-root';
    Object.assign(state.panel.style, { left: `${state.config.panel.left}px`, top: `${state.config.panel.top}px`, width: `${state.config.panel.width}px`, height: `${state.config.panel.height}px` });
    document.body.appendChild(state.panel);
    makeDraggable(state.panel);
    render();
    if (typeof GM_registerMenuCommand === 'function') GM_registerMenuCommand('Open BOC', () => { if (!state.panel) mount(); });
  }

  const CSS = `
#boc-root{position:fixed;z-index:2147483647;min-width:320px;min-height:300px;resize:both;overflow:hidden;font:13px/1.4 Inter,ui-sans-serif,system-ui,sans-serif;color:#e7edf5}#boc-root *{box-sizing:border-box}.boc-shell{height:100%;background:#111820;border:1px solid #344454;border-radius:10px;box-shadow:0 18px 50px #0008;display:flex;flex-direction:column;overflow:hidden}.boc-shell.light{background:#f4f6f8;color:#17232d;border-color:#b6c2ce}.boc-titlebar{height:42px;padding:0 12px;background:linear-gradient(100deg,#0d2835,#173c4c);display:flex;align-items:center;justify-content:space-between;cursor:move}.light .boc-titlebar{background:#dbe6eb}.boc-titlebar strong{font-size:14px}.boc-titlebar strong span{font-weight:400;opacity:.66;margin-left:4px}.boc-titlebar button,.boc-panel button,.boc-shell footer button{border:0;background:transparent;color:inherit;cursor:pointer;padding:4px 7px;font-size:14px}.boc-status{height:28px;padding:6px 12px;color:#9cb1bd;font-size:11px;display:flex;gap:10px}.boc-status span{margin-left:auto}.boc-status span+span{margin-left:0}.boc-dot{display:inline-block;width:7px;height:7px;background:#63d391;border-radius:50%;box-shadow:0 0 8px #63d391;vertical-align:middle;margin-right:5px}nav{display:flex;gap:2px;padding:0 8px;border-bottom:1px solid #293744;overflow:auto}.boc-tab{white-space:nowrap;color:#91a3af;background:transparent;border:0;border-bottom:2px solid transparent;padding:9px 7px;font-size:11px;cursor:pointer}.boc-tab.active{color:#d8f4f3;border-bottom-color:#52c4bd}main{flex:1;overflow:auto;padding:9px}.boc-message{border-left:3px solid #63d391;background:#19232c;margin-bottom:6px;padding:8px 9px;border-radius:0 5px 5px 0}.light .boc-message{background:#e6ebef}.boc-message.blue{border-color:#5ca9ff}.boc-message.yellow{border-color:#e5c55f}.boc-message.orange{border-color:#ee965a}.boc-message.red{border-color:#ec6d78}.boc-message-meta{display:flex;gap:7px;align-items:baseline}.boc-message-meta span{color:#72aeb4;font-size:11px}.boc-message-meta time{margin-left:auto;color:#71828d;font-size:10px}.boc-message p{margin:3px 0;color:inherit;word-break:break-word}.boc-message small{color:#71828d}.boc-empty{padding:36px 12px;text-align:center;color:#71828d}.boc-channel-head{display:flex;justify-content:space-between;border-bottom:1px solid #293744;padding:6px 2px 10px}.boc-channel-head span{font-size:10px;color:#71828d}.boc-channel textarea{width:100%;height:62px;background:#18232c;color:inherit;border:1px solid #344454;border-radius:5px;margin:10px 0 5px;padding:8px;resize:vertical}.boc-primary{background:#2d8c88!important;color:#fff!important;border-radius:4px;padding:7px 10px!important}.boc-log-row,.boc-pilot{display:flex;gap:8px;align-items:center;padding:8px;border-bottom:1px solid #293744}.boc-log-row time,.boc-pilot time{color:#71828d;font-size:10px}.boc-log-row b{color:#75c5bd;font-size:11px}.boc-pilot div{flex:1}.boc-pilot span{display:block;color:#8297a3;font-size:11px}.boc-settings{display:grid;gap:12px}.boc-settings label{display:grid;gap:5px;color:#b4c4cc}.boc-settings input:not([type=checkbox]){background:#18232c;color:inherit;border:1px solid #344454;border-radius:4px;padding:7px}.boc-setting-actions{display:flex;gap:5px;flex-wrap:wrap}.boc-setting-actions button,.boc-shell footer button{background:#263744;border-radius:4px;color:inherit}.boc-safety{font-size:11px;color:#81939d;border-left:2px solid #e5c55f;padding-left:8px}.boc-shell footer{padding:7px 10px;border-top:1px solid #293744;color:#81939d;font-size:11px;display:flex;justify-content:space-between}.is-minimized .boc-status,.is-minimized nav,.is-minimized main,.is-minimized footer{display:none}.is-minimized{height:42px!important;min-height:42px!important}`;

  function start() {
    hookNetwork();
    listenDomChat();
    if (document.body) mount(); else window.addEventListener('DOMContentLoaded', mount, { once: true });
    console.info('[BOC] Started. Local logging=%s relay=%s', state.config.logging, state.config.relayEnabled);
  }

  start();
})();
