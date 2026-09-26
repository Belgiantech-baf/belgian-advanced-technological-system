// ==UserScript==
// @name         BOC - BAF Operations Client
// @namespace    https://github.com/Belgiantech-baf/belgian-advanced-technological-system
// @version      3.0.0
// @description  BAF Operations Client: native-style GeoFS communications, monitoring, operations, and local moderation.
// @match        https://www.geo-fs.com/*
// @match        https://geo-fs.com/*
// @run-at       document-start
// @grant        GM_download
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG_KEY = 'BOC_SETTINGS';
  const LEGACY_CONFIG_KEY = 'boc.config.v2';
  const LOG_KEY = 'boc.activity.v2';
  const MAX_LOG = 2500;
  const MAX_MESSAGES = 500;
  const DEFAULT_RELAY = 'https://geofs-live-radar.onrender.com/api/boc/log';
  const BAF_IDENTIFIERS = ['BAF', '[BAF]', '(BAF)', '[UGRP]'];
  const MODULES = [
    ['communications', 'Dashboard'], ['bafchat', 'BAF CHAT'], ['radar', 'LIVE RADAR'], ['network', 'Active BAF Pilots'],
    ['operations', 'Operations'], ['alerts', 'Alerts'], ['logging', 'Logs'], ['settings', 'Settings'],
  ];
  const DEFAULT_KEYWORDS = ['alert', 'scramble', 'emergency', 'intercept', 'training', 'baf'];
  const DEFAULT_CONFIG = {
    enabled: true, commsEnabled: true, overlayEnabled: true, operationsEnabled: true, relayEnabled: false,
    relayUrl: DEFAULT_RELAY, loggerEnabled: true, saveChat: true, bafOnly: false, highlightTraffic: true,
    showUgrp: true, bafChatServer: 'https://geofs-live-radar.onrender.com', bafChatStatus: 'disconnected',
    tags: ['[BAF]', '[OPS]', '[ALERT]', '[TRAINING]', '[ADMIN]', '[UGRP]'], mutedUsers: [], watchList: [],
    keywords: DEFAULT_KEYWORDS, alerts: { bafUser: true, multipleBaf: true, mission: true, important: true, operations: true },
    theme: 'dark', darkMode: true, compact: false, draggable: true, resizable: true, opacity: 100, fontSize: 13,
    window: { top: 72, right: 18, width: 460, height: 680 }, debug: false, performance: false, eventMonitor: false, websocketMonitor: false,
  };
  const state = {
    config: loadConfig(), logs: loadLogs(), messages: [], pilots: new Map(), alerts: [], missions: [], moderation: [],
    tab: null, query: '', panel: null, button: null, unread: 0, lastBatch: '', seen: new Set(), connected: false,
    processed: 0, alertCount: 0, lastHeartbeat: null, startedAt: Date.now(),
    diagnostics: { geofs: false, toolbar: false, multiplayer: false, chat: false, overlay: false }, stages: new Set(), ready: false,
    bafChat: { connected: false, members: [], messages: [], source: null, status: 'disconnected', lastUpdate: null },
    batsAdapter: null,
  };

  function page() { return typeof unsafeWindow !== 'undefined' ? unsafeWindow : window; }
  function merge(base, value) { const result = { ...base, ...value }; Object.keys(base).forEach((key) => { if (base[key] && typeof base[key] === 'object' && !Array.isArray(base[key])) result[key] = { ...base[key], ...(value?.[key] || {}) }; }); return result; }
  function loadConfig() { try { return merge(DEFAULT_CONFIG, JSON.parse(localStorage.getItem(CONFIG_KEY) || localStorage.getItem(LEGACY_CONFIG_KEY) || '{}')); } catch { return merge({}, DEFAULT_CONFIG); } }
  function loadLogs() { try { const value = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); return Array.isArray(value) ? value.slice(-MAX_LOG) : []; } catch { return []; } }
  function saveConfig() { localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config)); }
  function saveLogs() { state.logs = state.logs.slice(-MAX_LOG); localStorage.setItem(LOG_KEY, JSON.stringify(state.logs)); }
  function now() { return new Date().toISOString(); }
  function uid() { return crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`; }
  function esc(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  function download(name, content, type) { const blob = new Blob([content], { type }); const url = URL.createObjectURL(blob); if (typeof GM_download === 'function') GM_download({ url, name, saveAs: true }); else { const link = document.createElement('a'); link.href = url; link.download = name; link.click(); } setTimeout(() => URL.revokeObjectURL(url), 1000); }
  function setting(name, fallback) { return state.config[name] === undefined ? fallback : state.config[name]; }
  function panelDimensions() { const width = Number(state.config.window?.width); const height = Number(state.config.window?.height); return { width: width >= 320 ? width : DEFAULT_CONFIG.window.width, height: height >= 300 ? height : DEFAULT_CONFIG.window.height }; }
  function log(message, error) { if (error) console.error(`[BOC ERROR] ${message}`, error); else console.info(`[BOC] ${message}`); }
  function stage(number) { state.stages.add(number); log(`Stage ${number} complete`); }
  function safeRun(label, callback) { try { return callback(); } catch (error) { log(label, error); return null; } }
  function geo() { return page(); }
  function diagnosticRows() { return Object.entries({ geofs: 'GeoFS Loaded', toolbar: 'Toolbar Found', multiplayer: 'Multiplayer Found', chat: 'Chat Found', overlay: 'Overlay Active' }).map(([key, label]) => `<div class="boc-diagnostic"><span class="${state.diagnostics[key] ? 'ok' : 'fail'}"></span>${label}<b>${state.diagnostics[key] ? 'PASS' : 'WAITING'}</b></div>`).join(''); }
  async function waitForGeoFS() {
    const started = Date.now();
    while (Date.now() - started < 30000) {
      const root = geo();
      const toolbar = findToolbar();
      if ((root && (root.geofs || root.ui || root.multiplayer || root.flight)) || toolbar) {
        state.diagnostics.geofs = Boolean(root?.geofs || root?.ui || root?.multiplayer || root?.flight || toolbar);
        return root || window;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('GeoFS readiness timeout after 30 seconds');
  }
  async function waitForSelector(selector, timeout = 30000) {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      const element = document.querySelector(selector);
      if (element) return element;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return null;
  }

  function record(type, data = {}) {
    const entry = { id: uid(), type, timestamp: now(), ...data };
    if (state.config.loggerEnabled) { state.logs.push(entry); saveLogs(); }
    if (state.config.relayEnabled && !type.startsWith('relay-')) relay(entry);
    return entry;
  }
  function alertUser(type, data = {}) { const entry = record('alert', { alertType: type, ...data }); state.alerts.unshift(entry); state.alerts = state.alerts.slice(0, 100); state.alertCount += 1; render(); }
  async function relay(entry) {
    if (!/^https:\/\//i.test(state.config.relayUrl || '')) return;
    try { const response = await fetch(state.config.relayUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: 'BOC', channel: 'BAF Operations', ...entry }) }); if (!response.ok) throw new Error(`HTTP ${response.status}`); } catch (error) { if (state.config.debug) console.warn('[BOC] relay failed', error); }
  }

  function normalize(raw) {
    const text = raw?.msg ?? raw?.message ?? raw?.content ?? raw?.text;
    if (typeof text !== 'string' || !text.trim()) return null;
    let message; try { message = decodeURIComponent(text).trim(); } catch { message = text.trim(); }
    const callsign = String(raw.cs ?? raw.callsign ?? raw.username ?? 'unknown').trim();
    return { id: String(raw.id ?? raw.messageId ?? `${raw.uid ?? ''}|${raw.acid ?? ''}|${callsign}|${message}`), callsign, uid: raw.uid ?? raw.userId ?? null, aircraftId: raw.acid ?? raw.aircraftId ?? null, message, timestamp: raw.timestamp ?? now(), server: raw.server ?? 'GeoFS' };
  }
  function classify(message) { const value = message.toUpperCase(); if (value.includes('[UGRP]')) return 'purple'; if (value.includes('[ADMIN]') || value.includes('[ALERT]') || /\b(emergency|scramble)\b/i.test(value)) return 'red'; if (value.includes('[OPS]') || value.includes('[MISSION]')) return 'yellow'; if (value.includes('[BAF]') || value.includes('[TRAINING]')) return 'blue'; if (state.config.keywords.some((word) => value.includes(word.toUpperCase()))) return 'orange'; return 'green'; }
  function isBaf(callsign) { const value = String(callsign || '').toUpperCase(); return BAF_IDENTIFIERS.some((identifier) => value.includes(identifier)) || state.config.tags.some((tag) => value.includes(String(tag).toUpperCase())); }
  function upsertPilot(raw, source = 'GeoFS') {
    const callsign = String(raw?.cs ?? raw?.callsign ?? raw?.username ?? raw?.name ?? '').trim();
    if (!callsign || !isBaf(callsign)) return false;
    state.pilots.set(callsign, { callsign, username: String(raw?.username ?? raw?.name ?? callsign), uid: raw?.uid ?? raw?.userId ?? null, aircraft: raw?.acid ?? raw?.aircraftId ?? raw?.aircraft ?? null, lastSeen: raw?.timestamp ?? now(), server: raw?.server ?? source, officer: /officer|admin/i.test(callsign) });
    return true;
  }
  function keywordHit(message) { return state.config.keywords.some((word) => new RegExp(`\\b${String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(message)); }
  function getBATSAdapter() {
    if (state.batsAdapter) return state.batsAdapter;
    const adapterCtor = window.BOC?.BATSAdapter || window.BATSAdapter || window.BOC?.Adapter?.BATS || window.BATS?.Adapter || null;
    if (typeof adapterCtor === 'function') {
      const instance = new adapterCtor({
        core: {
          getOperations: () => state.missions,
          getActivePilots: () => [...state.pilots.values()],
          sendEvent: () => undefined,
        },
        tags: [...new Set([...(state.config.tags || []), ...BAF_IDENTIFIERS, ...DEFAULT_KEYWORDS])],
      });
      state.batsAdapter = instance;
      if (window.BOC) { window.BOC.app = window.BOC.app || {}; window.BOC.app.bats = instance; }
      if (window.BATS) { window.BATS.instance = instance; }
      return instance;
    }
    return null;
  }
  function receive(raw) {
    const message = normalize(raw); if (!message || state.seen.has(message.id)) return;
    if (state.config.mutedUsers.some((user) => user.toLowerCase() === message.callsign.toLowerCase())) return;
    state.seen.add(message.id); if (state.seen.size > 5000) state.seen.delete(state.seen.values().next().value);
    message.category = classify(message.message); message.baf = isBaf(message.callsign); message.keyword = keywordHit(message.message);
    state.messages.push(message); state.messages = state.messages.slice(-MAX_MESSAGES); state.processed += 1; state.lastHeartbeat = Date.now(); state.connected = true;
    record('chat', message);
    if (message.baf) { upsertPilot(message, message.server); record('baf-detection', { callsign: message.callsign, uid: message.uid }); if (state.config.alerts.bafUser) alertUser('BAF User Detected', { callsign: message.callsign }); }
    if (message.category === 'red' && state.config.alerts.operations) alertUser('Operations Alert', { callsign: message.callsign, message: message.message });
    if (keywordHit(message.message)) state.moderation.unshift({ action: 'Keyword highlight', callsign: message.callsign, message: message.message, timestamp: now() });
    if (!isOpen()) state.unread += 1; updateButton(); render();
  }
  function poll() {
    safeRun('pilot tracking failed', () => {
      const adapter = getBATSAdapter();
      const root = geo();
      const multiplayer = root?.multiplayer;
      state.diagnostics.multiplayer = Boolean(multiplayer || adapter);

      const batsRadar = adapter && typeof adapter.getRadarData === 'function' ? adapter.getRadarData() : null;
      if (batsRadar) {
        const tracked = Array.isArray(batsRadar.trackedAircraft) ? batsRadar.trackedAircraft : [];
        const active = Array.isArray(batsRadar.activeBAF) ? batsRadar.activeBAF : [];
        tracked.forEach((pilot) => upsertPilot({ cs: pilot.callsign, username: pilot.username, acid: pilot.id, aircraft: pilot.aircraft, ...pilot }, pilot.server || 'BATS'));
        active.forEach((pilot) => upsertPilot({ cs: pilot.callsign, username: pilot.username, acid: pilot.id, aircraft: pilot.aircraft, ...pilot }, pilot.server || 'BATS'));
        state.missions = Array.isArray(batsRadar.operations) ? batsRadar.operations : state.missions;
      }

      if (!multiplayer) return;
      const messages = multiplayer.lastRequest?.chatMessages;
      if (Array.isArray(messages) && messages.length) { const signature = messages.map((item) => `${item.id ?? ''}|${item.uid ?? ''}|${item.acid ?? ''}|${item.cs ?? ''}|${item.msg ?? ''}`).join('\n'); if (signature !== state.lastBatch) { state.lastBatch = signature; messages.forEach(receive); } }
      const users = multiplayer.users ?? multiplayer.lastRequest?.users ?? [];
      const userList = Array.isArray(users) ? users : Object.values(users || {});
      userList.forEach((user) => upsertPilot(user, 'GeoFS'));
    });
  }

  function applyFilter(element) {
    const label = element.querySelector?.('b.label'); if (!label) return;
    if (!setting('callsignFilter', true)) { label.style.display = ''; element.style.display = ''; return; }
    const callsign = label.getAttribute('callsign') || ''; const match = isBaf(callsign) || state.config.tags.some((tag) => callsign.toUpperCase().includes(tag.toUpperCase()));
    label.style.display = match ? '' : 'none'; element.style.opacity = match ? '1' : '.35';
  }
  function chatRecordFromElement(element) {
    const label = element.querySelector?.('b.label, .label, [callsign]');
    const messageNode = element.querySelector?.('.message, .text, .content, p');
    const callsign = label?.getAttribute?.('callsign') || label?.textContent?.trim() || element.getAttribute?.('data-callsign') || 'unknown';
    const message = messageNode?.textContent?.trim() || element.getAttribute?.('data-message') || element.textContent?.replace(callsign, '').trim();
    if (!message) return null;
    return { id: element.id || element.getAttribute?.('data-message-id') || `${callsign}|${message}`, cs: callsign, msg: message, timestamp: element.getAttribute?.('data-timestamp') || now(), server: 'GeoFS DOM' };
  }
  function captureChatElement(element) { safeRun('chat message capture failed', () => { if (!element?.matches?.('.geofs-chat-message')) return; applyFilter(element); const raw = chatRecordFromElement(element); if (raw) receive(raw); }); }
  function installChatObserver() { safeRun('chat hooks failed', () => { const chatSelector = '.geofs-chat-message'; const existing = document.querySelectorAll?.(chatSelector) || []; existing.forEach(captureChatElement); if (typeof MutationObserver !== 'function' || !document.documentElement) return; const observer = new MutationObserver((records) => records.forEach((record) => record.addedNodes.forEach((node) => { if (node.nodeType === 1) { if (node.matches?.(chatSelector)) captureChatElement(node); node.querySelectorAll?.(chatSelector).forEach(captureChatElement); } }))); observer.observe(document.documentElement, { childList: true, subtree: true }); state.diagnostics.chat = Boolean(document.querySelector('.geofs-chat-message, .geofs-chat-messages')); }); }

  function isOpen() { return Boolean(state.panel?.classList.contains('geofs-visible')); }
  function updateButton() { if (!state.button) return; const badge = state.button.querySelector('.boc-unread'); if (badge) badge.hidden = !state.unread; state.button.title = state.unread ? `BOC (${state.unread} unread)` : 'BAF Operations Client'; }
  function matchesUgrpFilter(message) {
    const shouldShowUgrp = setting('showUgrp', true);
    return shouldShowUgrp || !/\[UGRP\]/i.test(String(message || ''));
  }
  function visibleMessages() { return state.messages.filter((item) => {
    const matchesUgrp = matchesUgrpFilter(item.message || '');
    const matchesBafOnly = !state.config.bafOnly || item.baf || isBaf(item.callsign || '');
    const matchesQuery = !state.query || `${item.callsign} ${item.message}`.toLowerCase().includes(state.query.toLowerCase());
    return matchesUgrp && matchesBafOnly && matchesQuery;
  }).slice().reverse(); }
  function toggle(name, label) { return `<label class="boc-switch"><input type="checkbox" data-setting="${name}" ${setting(name, false) ? 'checked' : ''}><span></span>${label}</label>`; }
  function row(item) { return `<article class="boc-row ${item.category}"><header><b>${esc(item.callsign)}</b><time>${esc(new Date(item.timestamp).toLocaleTimeString())}</time></header><p>${esc(item.message)}</p><small>${esc(item.server)}${item.keyword ? ' Â· keyword' : ''}</small></article>`; }
  function stat(label, value) { return `<div class="boc-stat"><b>${esc(value)}</b><span>${esc(label)}</span></div>`; }
  function renderTabs() { return MODULES.map(([id, label]) => `<button class="boc-tab ${state.tab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join(''); }
  function renderBafChat() {
    const history = Array.isArray(state.bafChat.messages) ? state.bafChat.messages.slice(-25).reverse().filter((item) => {
      const matchesUgrp = matchesUgrpFilter(item.message || '');
      const matchesBafOnly = !state.config.bafOnly || isBaf(item.callsign || item.username || '') || /\bBAF\b|\[BAF\]|\[UGRP\]/i.test(item.message || '');
      return matchesUgrp && matchesBafOnly;
    }) : [];
    const members = Array.isArray(state.bafChat.members) ? state.bafChat.members.slice(0, 12) : [];
    const connected = state.bafChat.connected ? 'Connected' : 'Reconnecting';
    const channelRows = history.length ? history.map((item) => `<article class="boc-item"><b>${esc(item.callsign || item.username || 'BAF')}</b><span>${esc(item.message || '')} <small>${esc(new Date(item.timestamp || Date.now()).toLocaleTimeString())}</small></span></article>`).join('') : '<div class="boc-empty">No messages yet. Send the first BAF update.</div>';
    return `
      <div class="boc-toolbar"><span class="boc-status ${state.bafChat.connected ? 'ok' : 'warn'}">${connected}</span><button data-action="baf-refresh">Refresh</button></div>
      <div class="boc-toolbar"><input id="baf-chat-input" maxlength="500" placeholder="Message BAF CHAT" value=""><button data-action="baf-send">Send</button></div>
      <div class="boc-toolbar">${toggle('showUgrp', 'Show [UGRP]')} ${toggle('bafOnly', 'BAF only')}</div>
      <div class="boc-toolbar"><strong>Members</strong></div>
      <div class="boc-tags">${members.length ? members.map((member) => `<button class="selected">${esc(member)}</button>`).join('') : '<button class="selected">Awaiting connection</button>'}</div>
      <div class="boc-section-title">BAF CHAT</div>
      ${channelRows}
    `;
  }
  function normalizeBatsAircraft(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const callsign = String(entry.callsign ?? entry.cs ?? entry.username ?? entry.name ?? '').trim();
    if (!callsign) return null;
    return {
      id: entry.id ?? entry.aircraftId ?? entry.acid ?? callsign,
      callsign,
      username: entry.username ?? entry.user ?? entry.callsign ?? callsign,
      aircraft: entry.aircraft ?? entry.aircraftType ?? entry.model ?? 'Unknown',
      latitude: entry.latitude ?? entry.lat ?? entry.position?.lat ?? null,
      longitude: entry.longitude ?? entry.lon ?? entry.position?.lon ?? null,
      altitude: entry.altitude ?? entry.alt ?? entry.altitudeFt ?? null,
      heading: entry.heading ?? entry.hdg ?? entry.course ?? null,
      speed: entry.speed ?? entry.airspeed ?? entry.velocity ?? null,
      status: entry.status ?? (entry.baf ? 'BAF' : 'Online'),
      lastUpdate: entry.lastUpdate ?? entry.timestamp ?? new Date().toISOString(),
      baf: Boolean(entry.baf || /\bBAF\b|\[BAF\]/i.test(callsign)),
    };
  }
  function getLiveRadarAircraft() {
    const adapter = getBATSAdapter();
    const bats = window.BATS || window.BOC?.app?.bats || window.BOC?.Adapter?.BATS || adapter || null;

    if (adapter && typeof adapter.getTrackedAircraft === 'function') {
      const aircraft = adapter.getTrackedAircraft();
      if (Array.isArray(aircraft) && aircraft.length) return aircraft.map(normalizeBatsAircraft).filter(Boolean);
    }
    if (bats && typeof bats.getAircraft === 'function') {
      const aircraft = bats.getAircraft();
      if (Array.isArray(aircraft) && aircraft.length) return aircraft.map(normalizeBatsAircraft).filter(Boolean);
    }
    if (bats && typeof bats.getActivePilots === 'function') {
      const pilots = bats.getActivePilots();
      if (Array.isArray(pilots) && pilots.length) return pilots.map(normalizeBatsAircraft).filter(Boolean);
    }
    const snapshot = Array.isArray(window.batsAircraft) ? window.batsAircraft : Array.isArray(window.__BATS_AIRCRAFT__) ? window.__BATS_AIRCRAFT__ : [];
    if (snapshot.length) return snapshot.map(normalizeBatsAircraft).filter(Boolean);
    return [];
  }
  function renderRadar() {
    const aircraft = getLiveRadarAircraft().filter((item) => !state.config.bafOnly || item.baf);
    const connected = aircraft.length > 0;
    const rows = aircraft.length ? aircraft.slice(0, 18).map((item) => {
      const lat = item.latitude != null ? Number(item.latitude) : null;
      const lon = item.longitude != null ? Number(item.longitude) : null;
      const coord = lat !== null && lon !== null ? `${lat.toFixed(3)}, ${lon.toFixed(3)}` : '—';
      const label = item.baf ? ' [BAF]' : ' [RAW]';
      return `
        <div class="boc-irc-entry ${item.baf ? 'baf' : 'raw'}">
          <span class="boc-irc-user">${esc(item.callsign)}${label}</span>
          <span class="boc-irc-meta">${esc(item.aircraft ?? 'UNK')} · ${esc(item.altitude ?? '—')} ft</span>
          <span class="boc-irc-text">${esc(item.heading ?? '—')}° · ${esc(item.speed ?? '—')} kt · ${coord}</span>
        </div>
      `;
    }).join('') : '<div class="boc-empty">[RADAR] offline — awaiting live feed</div>';

    return `
      <div class="boc-section-title">IRC // BATS RADAR</div>
      <div class="boc-stats">
        <div class="boc-stat"><b>${connected ? aircraft.length : 0}</b><span>TRACKS</span></div>
        <div class="boc-stat"><b>${connected ? 'LIVE' : 'WAIT'}</b><span>STATUS</span></div>
        <div class="boc-stat"><b>${connected ? 'OK' : '—'}</b><span>SYNC</span></div>
      </div>
      <div class="boc-toolbar">
        <input data-query placeholder="Search callsign" value="${esc(state.query)}">
        <button data-action="radar-filter">${state.config.bafOnly ? 'BAF' : 'ALL'}</button>
      </div>
      <div class="boc-irc-panel">
        <div class="boc-irc-header">
          <span class="boc-irc-dot ${connected ? 'online' : 'offline'}"></span>
          <strong>RDR</strong>
          <small>${connected ? 'connected' : 'reconnecting'}</small>
        </div>
        <div class="boc-irc-window">${rows}</div>
      </div>
    `;
  }
  function content() {
    if (state.tab === 'communications') return `<section class="boc-stats">${stat('Network', state.connected ? 'Connected' : 'Disconnected')}${stat('Active pilots', state.pilots.size)}${stat('Processed', state.processed)}</section>${toggle('commsEnabled', 'Enable BAF Communications')}${toggle('overlayEnabled', 'Enable BAF Channel Overlay')}${toggle('operationsEnabled', 'Enable Operations Feed')}${toggle('relayEnabled', 'Enable Relay System')}<p class="boc-muted">Last heartbeat: ${state.lastHeartbeat ? new Date(state.lastHeartbeat).toLocaleTimeString() : 'Waiting'}</p>`;
    if (state.tab === 'chat') return `<div class="boc-toolbar"><input data-query placeholder="Search chat" value="${esc(state.query)}"><button data-action="export-csv">Export</button><button data-action="clear-chat">Clear</button></div>${toggle('loggerEnabled', 'Enable GeoFS Chat Logger')}${toggle('saveChat', 'Save Chat Log')}${toggle('bafOnly', 'Show BAF Messages Only')}${toggle('showUgrp', 'Show [UGRP] Filter')}${toggle('highlightTraffic', 'Highlight Operational Traffic')}<div class="boc-tags">${state.config.tags.map((tag) => `<button data-tag="${esc(tag)}" class="selected">${esc(tag)}</button>`).join('')}</div>${visibleMessages().map(row).join('') || '<div class="boc-empty">Waiting for GeoFS chat</div>'}`;
    if (state.tab === 'baf') return `<div class="boc-section-title">BAF Channel</div><p class="boc-muted">Local BAF-only view of public GeoFS chat traffic.</p><div class="boc-toolbar"><input data-query placeholder="Search BAF traffic" value="${esc(state.query)}"><button data-action="clear-chat">Clear</button></div>${visibleMessages().filter((item) => item.baf).map(row).join('') || '<div class="boc-empty">No BAF traffic detected</div>'}`;
    if (state.tab === 'bafchat') return renderBafChat();
    if (state.tab === 'radar') return renderRadar();
    if (state.tab === 'network') return `<div class="boc-toolbar"><select data-network-filter><option>Show all</option><option>Show BAF only</option><option>Show officers</option><option>Show training flights</option></select></div>${[...state.pilots.values()].map((pilot) => `<article class="boc-item"><b>${esc(pilot.username || pilot.callsign)}</b><span>${esc(pilot.callsign)} Â· ${esc(pilot.aircraft ?? 'Unknown aircraft')} Â· ${esc(pilot.server)} Â· last seen ${esc(new Date(pilot.lastSeen).toLocaleTimeString())}</span></article>`).join('') || '<div class="boc-empty">No BAF pilots detected</div>'}`;
    if (state.tab === 'operations') return `<div class="boc-section-title">Mission bulletin board</div>${state.missions.map((mission) => `<details class="boc-notice" open><summary>${esc(mission.title)} <small>${esc(mission.timestamp)}</small></summary><p>${esc(mission.message)}</p></details>`).join('') || '<div class="boc-empty">No current missions or notices</div>'}`;
    if (state.tab === 'moderation') return '<div class="boc-section-title">Local review tools</div><label>Keywords<input data-setting="keywords" value="' + esc(state.config.keywords.join(', ')) + '"></label><label>Mute list<input data-setting="mutedUsers" value="' + esc(state.config.mutedUsers.join(', ')) + '"</label><label>Watch list<input data-setting="watchList" value="' + esc(state.config.watchList.join(', ')) + '"></label>' + (state.moderation.slice(0, 30).map((item) => '<article class="boc-item"><b>' + esc(item.action) + '</b><span>' + esc(item.callsign) + ' - ' + esc(item.message) + '</span></article>').join('') || '<div class="boc-empty">No moderation activity</div>');
    if (state.tab === 'logging') return `<section class="boc-stats">${stat('Messages processed', state.processed)}${stat('Alerts generated', state.alertCount)}${stat('BAF users detected', state.pilots.size)}</section><button data-action="export-json">Export JSON</button><button data-action="export-csv">Export CSV</button><button data-action="clear-logs">Clear Logs</button>${state.logs.slice().reverse().slice(0, 80).map((item) => `<article class="boc-item"><b>${esc(item.type)}</b><span>${esc(item.callsign || item.message || item.alertType || '')} Â· ${esc(new Date(item.timestamp).toLocaleTimeString())}</span></article>`).join('')}`;
    if (state.tab === 'alerts') return '<div class="boc-section-title">Alert settings</div>' + Object.entries({ bafUser: 'BAF User Detected', multipleBaf: 'Multiple BAF Members Online', mission: 'Mission Notice', important: 'Important Communication', operations: 'Operations Alert' }).map(([key, label]) => '<label class="boc-switch"><input type="checkbox" data-setting="alert-' + key + '" ' + (state.config.alerts[key] ? 'checked' : '') + '><span></span>' + label + '</label>').join('') + '<div class="boc-section-title">Recent Alerts</div>' + (state.alerts.map((item) => '<article class="boc-item"><b>' + esc(item.alertType) + '</b><span>' + esc(item.callsign || 'BOC') + ' - ' + esc(new Date(item.timestamp).toLocaleTimeString()) + '</span></article>').join('') || '<div class="boc-empty">No recent alerts</div>');
    if (state.tab === 'settings') return `${toggle('darkMode', 'Dark Mode')}${toggle('compact', 'Compact Mode')}${toggle('draggable', 'Draggable Windows')}${toggle('resizable', 'Resizable Windows')}<label>Opacity<input type="range" min="60" max="100" data-setting="opacity" value="${esc(state.config.opacity)}"></label><label>Font size<input type="range" min="11" max="18" data-setting="fontSize" value="${esc(state.config.fontSize)}"></label><label>Theme<select data-setting="theme"><option value="dark" ${state.config.theme === 'dark' ? 'selected' : ''}>Dark</option><option value="light" ${state.config.theme === 'light' ? 'selected' : ''}>Light</option></select></label><div class="boc-section-title">BOC Diagnostics</div>${diagnosticRows()}<div class="boc-section-title">Advanced</div>${toggle('debug', 'Debug logging')}${toggle('performance', 'Performance monitor')}${toggle('eventMonitor', 'Event monitor')}${toggle('websocketMonitor', 'WebSocket monitor')}<button data-action="export-config">Export config</button><button data-action="import-config">Import config</button><button data-action="reset">Reset BOC</button><p class="boc-muted">BOC v3.0.0 - Belgian Tech - uptime ${Math.floor((Date.now() - state.startedAt) / 1000)}s</p>`;
    return '<div class="boc-empty">Select a BOC module</div>';
  }
  function render() { if (!state.panel) return; state.panel.innerHTML = `<div class="boc-shell ${state.config.theme} ${state.config.compact ? 'compact' : ''}" style="opacity:${state.config.opacity / 100};font-size:${state.config.fontSize}px"><header class="boc-head"><div><b>BAF Operations Client (BOC)</b><small>Belgian Tech Systems</small></div><button data-action="minimize" aria-label="Minimize">_</button><button data-action="close" aria-label="Close">X</button></header><nav>${renderTabs()}</nav><main>${content()}</main><footer>${state.messages.length} messages - ${state.pilots.size} BAF pilots</footer></div>`; bind(); }
  function setArray(key, value) { state.config[key] = value.split(',').map((item) => item.trim()).filter(Boolean); }
  async function parseJsonResponse(response) {
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) return response.json();
    const text = await response.text();
    if (!text || !text.trim()) return null;
    try { return JSON.parse(text); } catch {
      throw new Error(`Non-JSON response from ${response.url || 'third-party BAF chat server'}: ${text.slice(0, 120)}`);
    }
  }
  async function sendBafChatMessage() {
    const input = state.panel?.querySelector('#baf-chat-input');
    const messageText = (input?.value || '').trim();
    if (!messageText) return;
    const payload = {
      channel: 'BAF CHAT',
      callsign: state.config.callsign || 'BAF-OPS',
      username: state.config.callsign || 'BAF-OPS',
      message: messageText,
      source: 'BAF_CHAT',
      server: 'BOC Server',
    };
    const url = `${String(state.config.bafChatServer || 'https://geofs-live-radar.onrender.com').replace(/\/+$/, '')}/api/baf-chat/messages`;
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await parseJsonResponse(response);
      state.bafChat.connected = true;
      state.bafChat.status = 'connected';
      if (result?.message) state.bafChat.messages.push(result.message);
      if (input) input.value = '';
      render();
    } catch (error) {
      state.bafChat.connected = false;
      state.bafChat.status = 'third-party unavailable';
      console.warn('[BOC] BAF chat send failed', error);
      render();
    }
  }
  async function refreshBafChatHistory() {
    const url = `${String(state.config.bafChatServer || 'https://geofs-live-radar.onrender.com').replace(/\/+$/, '')}/api/baf-chat/messages?limit=50`;
    try {
      const response = await fetch(url, { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await parseJsonResponse(response);
      state.bafChat.messages = Array.isArray(data?.messages) ? data.messages : [];
      state.bafChat.connected = true;
      state.bafChat.status = 'connected';
      state.bafChat.members = [...new Set(state.bafChat.messages.map((item) => item.callsign || item.username).filter(Boolean).slice(0, 12))];
    } catch (error) {
      state.bafChat.connected = false;
      state.bafChat.status = 'third-party unavailable';
      console.warn('[BOC] BAF chat history unavailable', error);
      if (state.panel) render();
    }
  }
  function attachBafChatStream() {
    if (state.bafChat.source) return;
    const url = `${String(state.config.bafChatServer || 'https://geofs-live-radar.onrender.com').replace(/\/+$/, '')}/api/events`;
    try {
      const source = new EventSource(url);
      source.addEventListener('baf.chat', (event) => {
        try {
          const entry = JSON.parse(event.data || '{}');
          if (entry && entry.message) {
            state.bafChat.messages.push(entry);
            state.bafChat.messages = state.bafChat.messages.slice(-200);
            state.bafChat.connected = true;
            state.bafChat.status = 'connected';
            render();
          }
        } catch (error) {
          console.warn('[BOC] BAF chat stream payload invalid', error);
        }
      });
      source.addEventListener('chat.message', (event) => {
        try {
          const entry = JSON.parse(event.data || '{}');
          if (entry && entry.message && (entry.server === 'BOC Server' || entry.server === 'BAF_CHAT')) {
            state.bafChat.messages.push(entry);
            state.bafChat.messages = state.bafChat.messages.slice(-200);
            state.bafChat.connected = true;
            state.bafChat.status = 'connected';
            render();
          }
        } catch (error) {
          console.warn('[BOC] BAF chat message event invalid', error);
        }
      });
      source.onerror = () => {
        state.bafChat.connected = false;
        state.bafChat.status = 'third-party unavailable';
        if (state.panel) render();
      };
      state.bafChat.source = source;
    } catch (error) {
      state.bafChat.connected = false;
      state.bafChat.status = 'third-party unavailable';
      console.warn('[BOC] EventSource unavailable for BAF chat', error);
      if (state.panel) render();
    }
  }
  function applySetting(key, value) {
    if (key === 'keywords' || key === 'mutedUsers' || key === 'watchList') {
      setArray(key, String(value));
    } else if (key.startsWith('alert-')) {
      state.config.alerts[key.slice(6)] = Boolean(value);
    } else {
      state.config[key] = value;
    }
    saveConfig();
    render();
  }
  function bind() {
    state.panel.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => { state.tab = button.dataset.tab; state.config.activeTab = state.tab; saveConfig(); render(); }));
    state.panel.querySelector('[data-query]')?.addEventListener('input', (event) => { state.query = event.target.value; render(); });
    state.panel.querySelectorAll('[data-setting]').forEach((input) => input.addEventListener('change', () => { const key = input.dataset.setting; const value = key === 'keywords' || key === 'mutedUsers' || key === 'watchList' ? input.value : key.startsWith('alert-') ? input.checked : input.type === 'checkbox' ? input.checked : input.type === 'range' ? Number(input.value) : input.value; applySetting(key, value); }));
    state.panel.querySelector('[data-action="close"]')?.addEventListener('click', close);
    state.panel.querySelector('[data-action="minimize"]')?.addEventListener('click', () => state.panel.classList.toggle('boc-minimized'));
    state.panel.querySelector('[data-action="clear-chat"]')?.addEventListener('click', () => { state.messages = []; render(); });
    state.panel.querySelector('[data-action="clear-logs"]')?.addEventListener('click', () => { state.logs = []; saveLogs(); render(); });
    state.panel.querySelector('[data-action="export-json"]')?.addEventListener('click', () => download('boc-logs.json', JSON.stringify(state.logs, null, 2), 'application/json'));
    state.panel.querySelectorAll('[data-action="export-csv"]').forEach((button) => button.addEventListener('click', () => download('boc-logs.csv', ['timestamp,type,callsign,message', ...state.logs.map((item) => [item.timestamp, item.type, item.callsign, item.message].map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))].join('\n'), 'text/csv')));
    state.panel.querySelector('[data-action="export-config"]')?.addEventListener('click', () => download('boc-config.json', JSON.stringify(state.config, null, 2), 'application/json'));
    state.panel.querySelector('[data-action="reset"]')?.addEventListener('click', () => { state.config = merge({}, DEFAULT_CONFIG); saveConfig(); render(); });
    state.panel.querySelector('[data-action="baf-send"]')?.addEventListener('click', sendBafChatMessage);
    state.panel.querySelector('[data-action="baf-refresh"]')?.addEventListener('click', refreshBafChatHistory);
    const bafInput = state.panel.querySelector('#baf-chat-input');
    bafInput?.addEventListener('keydown', (event) => { if (event.key === 'Enter') { event.preventDefault(); sendBafChatMessage(); } });
    state.panel.querySelector('[data-action="radar-filter"]')?.addEventListener('click', () => { state.config.bafOnly = !state.config.bafOnly; saveConfig(); render(); });
  }
  function open(tab) { safeRun('panel open failed', () => { state.tab = tab || state.tab || 'bafchat'; state.config.activeTab = state.tab; saveConfig(); if (!state.panel) mount(); if (!state.panel) { log('panel element unavailable'); return; } state.unread = 0; state.panel.hidden = false; state.panel.classList.add('geofs-visible'); state.panel.style.setProperty('position', 'fixed', 'important'); state.panel.style.setProperty('left', '10px', 'important'); state.panel.style.setProperty('top', '60px', 'important'); state.panel.style.setProperty('width', '360px', 'important'); state.panel.style.setProperty('max-height', 'calc(100vh - 80px)', 'important'); state.panel.style.setProperty('display', 'block', 'important'); state.panel.style.setProperty('visibility', 'visible', 'important'); state.panel.style.setProperty('pointer-events', 'auto', 'important'); log('BOC panel opened'); updateButton(); render(); }); }
  function close() { if (!state.panel) return; state.panel.classList.remove('geofs-visible'); state.panel.hidden = true; state.panel.style.setProperty('display', 'none', 'important'); }
  function toolbarText(element) { return (element.textContent || element.getAttribute?.('aria-label') || element.title || '').trim().toLowerCase(); }
  function findToolbar() {
    return document.querySelector('.geofs-ui-bottom, #geofs-ui-bottom, .geofs-bottom-bar, #geofs-bottom-bar, .geofs-ui-bottom-bar, .geofs-bottom-toolbar');
  }
  function makeButton() { const button = document.createElement('button'); button.id = 'boc-button'; button.type = 'button'; button.className = 'mdl-button mdl-js-button geofs-f-standard-ui geofs-mediumScreenOnly boc-toolbar-button'; button.title = 'BAF Operations Client'; button.setAttribute('aria-label', 'BAF Operations Client'); button.dataset.togglePanel = '.boc-panel'; button.dataset.tooltipClassname = 'mdl-tooltip--top'; button.setAttribute('tabindex', '0'); button.innerHTML = '<span class="boc-mark">🛡 BOC</span><span class="boc-unread" hidden></span>'; button.style.display = 'inline-flex'; button.style.visibility = 'visible'; button.style.opacity = '1'; button.addEventListener('click', (event) => { event.preventDefault(); event.stopImmediatePropagation(); if (isOpen()) close(); else open('bafchat'); }, true); return button; }
  function insertToolbarButton(toolbar) {
    if (geo().matchMedia?.('(max-width: 700px)').matches && insertMobileButton(toolbar)) return true;
    if (document.getElementById('boc-button')) return true;
    const button = makeButton();
    const controls = [...toolbar.children];
    const options = controls.find((element) => toolbarText(element).includes('options'));
    const camera = controls.find((element) => toolbarText(element).includes('camera'));
    if (options) toolbar.insertBefore(button, options);
    else if (camera?.nextSibling) toolbar.insertBefore(button, camera.nextSibling);
    else {
      toolbar.appendChild(button);
    }
    state.button = button;
    updateButton();
    console.info?.('[BOC] successfully attached to toolbar.');
    return true;
  }
  function insertMobileButton(toolbar) {
    const overflow = toolbar.querySelector('.geofs-mobile-menu, .geofs-ui-mobile, .geofs-ui-menu, [aria-label*="menu" i]');
    if (overflow && !document.getElementById('boc-button')) { const button = makeButton(); button.classList.add('boc-mobile-button'); overflow.appendChild(button); state.button = button; updateButton(); return true; }
    return false;
  }
  function mount() { safeRun('overlay creation failed', () => { const panelHost = document.body; if (!panelHost) return; const existing = document.getElementById('boc-panel'); if (existing) { state.panel = existing; if (existing.parentElement !== panelHost) panelHost.appendChild(existing); return; } state.panel = document.createElement('ul'); state.panel.id = 'boc-panel'; state.panel.className = 'geofs-list geofs-toggle-panel geofs-preference-list geofs-preferences geofs-stopMousePropagation geofs-stopKeyupPropagation boc-panel'; state.panel.dataset.noblur = 'true'; state.panel.hidden = true; state.panel.style.setProperty('display', 'none', 'important'); panelHost.appendChild(state.panel); state.diagnostics.overlay = true; render(); }); }
  function mountButton() {
    return safeRun('toolbar injection failed', () => {
      const toolbar = findToolbar();
      if (!toolbar) { log('waiting for toolbar...'); return false; }
      mount();
      if (document.getElementById('boc-button')) return true;
      return insertToolbarButton(toolbar) || insertMobileButton(toolbar);
    });
  }
  function installToolbarObserver() { safeRun('toolbar observer failed', () => { const root = document.body || document.documentElement; if (!root || typeof MutationObserver !== 'function') return; const observer = new MutationObserver(() => { const toolbar = findToolbar(); if (toolbar && !document.getElementById('boc-button')) mountButton(); }); observer.observe(root, { childList: true, subtree: true }); }); }
  function installPanelInteractions() {
    if (!state.panel || state.panel.dataset.interactions) return;
    state.panel.dataset.interactions = 'true';
    state.panel.addEventListener('mousedown', (event) => {
      if (!event.target.closest('.boc-head')) return;
      if (!state.config.draggable || event.target.closest('button')) return;
      const rect = state.panel.getBoundingClientRect();
      const move = (moveEvent) => { state.panel.style.left = `${rect.left + moveEvent.clientX - event.clientX}px`; state.panel.style.top = `${rect.top + moveEvent.clientY - event.clientY}px`; state.panel.style.right = 'auto'; };
      const end = () => { document.removeEventListener('mousemove', move); document.removeEventListener('mouseup', end); const current = state.panel.getBoundingClientRect(); state.config.window.top = Math.max(0, Math.round(current.top)); state.config.window.right = Math.max(0, Math.round(window.innerWidth - current.right)); saveConfig(); };
      document.addEventListener('mousemove', move); document.addEventListener('mouseup', end);
    });
    if (typeof ResizeObserver === 'function') new ResizeObserver(() => { if (state.config.resizable && state.panel.offsetWidth >= 320 && state.panel.offsetHeight >= 300) { state.config.window.width = state.panel.offsetWidth; state.config.window.height = state.panel.offsetHeight; saveConfig(); } }).observe(state.panel);
  }
  function installHotkeys() { safeRun('event hooks failed', () => { document.addEventListener('keydown', (event) => { if (event.key === 'Escape') return close(); if (!event.ctrlKey || !event.shiftKey) return; const keys = { B: 'bafchat', C: 'bafchat', O: 'operations', A: 'alerts' }; if (keys[event.key.toUpperCase()]) { event.preventDefault(); open(keys[event.key.toUpperCase()]); } }); }); }

  const css = `#boc-button{position:relative;margin:4px 8px;display:inline-flex;align-items:center;justify-content:center;min-width:88px;height:34px;padding:0 12px;border:1px solid rgba(128,149,170,.35);border-radius:8px;background:rgba(21,30,38,.94);color:#eef7ff;font:700 12px/1.1 Arial,sans-serif;letter-spacing:.04em;text-transform:uppercase;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.05)}#boc-button:hover{background:rgba(31,43,54,.96)}#boc-button.active{background:rgba(92,142,255,.2);border-color:rgba(92,142,255,.5)}.boc-mark{display:inline-flex;align-items:center;gap:6px;font-weight:800}.boc-unread{position:absolute;right:4px;top:4px;width:7px;height:7px;border-radius:50%;background:#ef6974}.boc-shell{width:min(460px,calc(100vw - 24px));height:min(680px,calc(100vh - 96px));min-width:320px;min-height:300px;background:#111820;color:#e7edf5;border:1px solid #344454;border-radius:4px;display:flex;flex-direction:column;overflow:hidden;font-family:Arial,sans-serif}.boc-shell.light{background:#f5f7f9;color:#17232d}.boc-shell.compact{line-height:1.15}.boc-head{display:flex;align-items:center;gap:4px;padding:9px 12px;background:#163b4a}.boc-head div{flex:1}.boc-head small{display:block;font-weight:400;opacity:.7}.boc-head button,.boc-tab,.boc-shell button{cursor:pointer;color:inherit}.boc-head button{background:none;border:0;font-size:18px}.boc-shell nav{display:flex;flex-wrap:wrap;border-bottom:1px solid #344454;background:#192631}.boc-tab{border:0;background:none;color:#9cb1bd;padding:7px 8px;font-size:11px}.boc-tab.active{color:#fff;border-bottom:2px solid #52c4bd}.boc-shell main{flex:1;overflow:auto;padding:8px}.boc-toolbar{display:flex;gap:4px;margin-bottom:7px}.boc-toolbar input{flex:1}.boc-shell input,.boc-shell textarea,.boc-shell select{box-sizing:border-box;background:#18232c;color:inherit;border:1px solid #344454;border-radius:3px;padding:6px}.boc-shell label{display:grid;gap:4px;margin:8px 2px}.boc-switch{display:flex!important;align-items:center;gap:8px}.boc-switch input{display:none}.boc-switch span{width:27px;height:15px;border-radius:8px;background:#56636b;position:relative}.boc-switch span:after{content:'';position:absolute;width:11px;height:11px;left:2px;top:2px;background:#fff;border-radius:50%;transition:.15s}.boc-switch input:checked+span{background:#3a9f91}.boc-switch input:checked+span:after{left:14px}.boc-row,.boc-item,.boc-notice{background:#19232c;border-bottom:1px solid #293744;padding:7px;margin-bottom:5px}.light .boc-row,.light .boc-item,.light .boc-notice{background:#e9eef2}.boc-row{border-left:3px solid #63d391}.boc-row.blue{border-color:#5ca9ff}.boc-row.yellow{border-color:#e5c55f}.boc-row.orange{border-color:#ef9a45}.boc-row.red{border-color:#ec6d78}.boc-row.purple{border-color:#a565f5}.boc-row header,.boc-item{display:flex;justify-content:space-between;gap:8px}.boc-row time,.boc-item span,.boc-muted,.boc-row small{color:#8297a3;font-size:.85em}.boc-row p{margin:4px 0}.boc-tags{display:flex;gap:4px;flex-wrap:wrap;margin:5px 0}.boc-tags button,.boc-shell main>button{border:0;border-radius:3px;background:#263744;padding:6px 8px}.boc-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:8px}.boc-stat{background:#192c35;padding:8px;text-align:center}.boc-stat b,.boc-stat span{display:block}.boc-stat span{font-size:.78em;color:#9cb1bd}.boc-notice summary{cursor:pointer}.boc-notice small{float:right;color:#8297a3}.boc-empty{text-align:center;color:#8297a3;padding:28px 8px}.boc-shell footer{padding:6px 8px;border-top:1px solid #293744;color:#8297a3;font-size:11px}.boc-minimized{height:auto;min-height:0}.boc-minimized .boc-shell>nav,.boc-minimized .boc-shell>main,.boc-minimized .boc-shell>footer{display:none}.boc-irc-panel{display:flex;flex-direction:column;border:1px solid #2a3846;border-radius:6px;background:#0d151d;overflow:hidden}.boc-irc-header{display:flex;align-items:center;gap:8px;padding:7px 9px;background:linear-gradient(180deg,#173247,#10202a);border-bottom:1px solid #243644;font-size:11px;text-transform:uppercase;letter-spacing:.08em}.boc-irc-dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#ff6473}.boc-irc-dot.online{background:#63d391}.boc-irc-dot.offline{background:#ff8a65}.boc-irc-window{display:flex;flex-direction:column;gap:6px;padding:8px;min-height:220px;background:#0d151d;color:#dbe9f4;font-family:Consolas,monospace;font-size:12px}.boc-irc-entry{display:flex;flex-direction:column;gap:2px;padding:6px 7px;border-left:2px solid #5ca9ff;background:rgba(24,39,52,.9);border-radius:3px}.boc-irc-entry.baf{border-left-color:#7c5cff}.boc-irc-entry.raw{border-left-color:#5ca9ff}.boc-irc-user{font-weight:700;color:#f5f9ff}.boc-irc-meta{color:#8fa8ba;font-size:10px}.boc-irc-text{color:#b8d3ea;word-break:break-word}.boc-radar-table{width:100%;border-collapse:collapse;font-size:11px}.boc-radar-table th,.boc-radar-table td{padding:4px 5px;border-bottom:1px solid #293744;text-align:left;vertical-align:top}`;
  const integrationCss = '#boc-root{display:none;position:fixed;z-index:10000;top:72px;right:18px;width:460px;height:680px;max-width:calc(100vw - 24px);max-height:calc(100vh - 96px);margin:0;padding:0;resize:both;overflow:hidden}#boc-root.geofs-visible{display:block}.boc-panel .boc-shell{width:100%;height:100%;box-sizing:border-box}.boc-toolbar-button{min-width:56px}.boc-toolbar-button .boc-mark{border:0;padding:0;font-weight:500}.boc-startup-toast{position:fixed;z-index:10001;right:18px;bottom:64px;padding:10px 14px;background:#263744;color:#e7edf5;border-left:3px solid #52c4bd;border-radius:3px;font:12px Arial,sans-serif;box-shadow:0 3px 12px #0006}.boc-mobile-button{display:none}@media(max-width:700px){#boc-root{top:48px;right:8px;width:calc(100vw - 16px);height:calc(100vh - 90px)}.boc-toolbar-button{display:none}.boc-mobile-button{display:block}}';
  const panelCss = '#boc-panel{display:none;position:fixed;left:10px;top:60px;width:360px;max-width:calc(100vw - 20px);max-height:calc(100vh - 80px);overflow-y:auto;box-sizing:border-box;margin:0;padding:0;z-index:2147483647}#boc-panel.geofs-visible{display:block !important}';
  const plainCss = '.boc-shell{width:auto!important;height:auto!important;min-width:0;min-height:0;background:transparent!important;color:inherit;border:0;border-radius:0;box-shadow:none;font-family:inherit}.boc-head{background:transparent;border-bottom:1px solid rgba(128,128,128,.35);padding:8px}.boc-head button{font-size:16px}.boc-shell nav{background:transparent}.boc-tab{color:inherit;border-radius:0}.boc-shell main{padding:8px}.boc-row,.boc-item,.boc-notice{background:transparent;border-radius:0;box-shadow:none}.boc-stat{background:transparent;border:1px solid rgba(128,128,128,.35);border-radius:0}.boc-tags button,.boc-shell main>button{border-radius:0;background:transparent;border:1px solid rgba(128,128,128,.45)}.boc-startup-toast{border-radius:0;box-shadow:none}';
  const diagnosticCss = '.boc-diagnostic{display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #293744}.boc-diagnostic span{width:8px;height:8px;border-radius:50%;background:#ef6974}.boc-diagnostic span.ok{background:#63d391}.boc-diagnostic b{margin-left:auto;font-size:10px;color:#8297a3}';
  function showToast() { safeRun('startup toast failed', () => { const toast = document.createElement('div'); toast.className = 'boc-startup-toast'; toast.textContent = 'BOC v1.0 | Belgian Tech | Ready'; document.body?.appendChild(toast); setTimeout(() => toast.remove(), 3500); }); }
  function exposeNamespace(root) {
    if (!root) return;
    root.BOC = root.BOC || {};
    Object.assign(root.BOC, {
      version: '1.0.0',
      waitForGeoFS,
      Core: { waitForGeoFS },
      Settings: { get: () => ({ ...state.config }), save: saveConfig, reset: () => { state.config = merge({}, DEFAULT_CONFIG); saveConfig(); render(); } },
      UI: { open, close, render },
      BATSAdapter: getBATSAdapter(),
      Chat: { getMessages: () => [...state.messages] },
      Network: { getPilots: () => [...state.pilots.values()] },
      Operations: { getMissions: () => [...state.missions] },
      Logging: { getLogs: () => [...state.logs], clear: () => { state.logs = []; saveLogs(); } },
      AlertManager: { getAlerts: () => [...state.alerts] },
      Overlay: { getElement: () => state.panel },
      Diagnostics: { get: () => ({ ...state.diagnostics, ready: state.ready, stages: [...state.stages] }) },
    });
  }
  async function initialize() {
    let root;
    try { root = await waitForGeoFS(); } catch (error) { log('GeoFS readiness failed', error); return; }
    state.diagnostics.geofs = Boolean(root?.geofs);
    stage(1);
    safeRun('stylesheet initialization failed', () => { if (document.head) { const style = document.createElement('style'); style.textContent = css + integrationCss + panelCss + plainCss + diagnosticCss; document.head.appendChild(style); } });
    const toolbar = await waitForSelector('.geofs-ui-bottom, #geofs-ui-bottom, .geofs-bottom-bar, #geofs-bottom-bar, .geofs-ui-bottom-bar, .geofs-bottom-toolbar');
    if (!toolbar) { log('toolbar detection timed out'); return; }
    stage(2);
    mountButton();
    state.diagnostics.toolbar = Boolean(document.getElementById('boc-button'));
    stage(3);
    mount();
    state.diagnostics.overlay = Boolean(document.getElementById('boc-panel'));
    stage(4);
    state.tab = state.config.activeTab || 'bafchat';
    refreshBafChatHistory();
    attachBafChatStream();
    stage(5);
    state.runtime = { ui: Boolean(root?.ui), multiplayer: Boolean(root?.multiplayer), flight: Boolean(root?.flight), weather: Boolean(root?.weather) };
    installChatObserver();
    state.diagnostics.chat = true;
    installHotkeys();
    installToolbarObserver();
    setInterval(poll, 750);
    state.ready = true;
    stage(6);
    exposeNamespace(root);
    stage(7);
    showToast();
  }
  function start() { initialize().catch((error) => log('initialization failed', error)); }
  start();
})();
