// ==UserScript==
// @name         BOC - BAF Operations Client
// @namespace    https://github.com/Belgiantech-baf/belgian-advanced-technological-system
// @version      2.0.0
// @description  Native GeoFS communications, callsign filtering, activity logging, and BAF operations menu.
// @match        https://www.geo-fs.com/*
// @match        https://geo-fs.com/*
// @run-at       document-start
// @grant        GM_download
// @grant        unsafeWindow
// ==/UserScript==

(function () {
  'use strict';

  const CONFIG_KEY = 'boc.config.v2';
  const LOG_KEY = 'boc.activity.v2';
  const MAX_LOG = 2000;
  const DEFAULT_RELAY = 'https://geofs-live-radar.onrender.com/api/boc/log';
  const TAG_COLORS = {
    RAF: 'pink', UAC: 'red', USSR: 'yellow', UAEAF: 'magenta', RNZAF: 'lightgreen',
    USAF: 'cyan', SHL: '#5A5AFC', RNLAF: 'orange', AEF: '#C8F94A', U: 'lightcoral',
    UTP: 'lightcoral', P: 'lightcoral', PMC: 'lightcoral',
  };
  const FILTER_TAGS = [
    '[U]', '[UTP]', '[P]', '[PMC]', '[NKG-KG]', '[SHL]', '[NFS]', '[AEF]', '[WANK]', '[NIUF]', '[RNLAF]', '[RNZAF]', '[USAF]', '[RAAF]',
    '[TUAF]', '[TASC]', '[UAC]', '[UAEAF]', '[USSR]', '[BAF]', '[PAF]', '[JASDF]', '[RAF]',
    '(U)', '(UTP)', '(P)', '(NKG-KG)', '(PMC)', '(RNLAF)', '(AEF)', '(RNZAF)', '(SHL)', '(NFS)', '(RAAF)', '(USAF)', '(TUAF)', '(JASDF)',
    '(TASC)', '(UAC)', '(UAEAF)', '(USSR)', '(BAF)', '(WANK)', '(NIUF)', '(PAF)', '(RAF)',
  ];
  const DEFAULT_CONFIG = {
    enabled: true,
    logging: true,
    callsignFilter: true,
    darkMode: true,
    relayEnabled: true,
    relayUrl: DEFAULT_RELAY,
    tags: ['[BAF]', '[OPS]', '[ALERT]', '[TRAINING]', '[ADMIN]'],
    mutedUsers: [],
  };
  const state = {
    config: loadConfig(),
    logs: loadLogs(),
    messages: [],
    pilots: new Map(),
    activeTab: 'chat',
    panel: null,
    button: null,
    unread: 0,
    lastBatch: '',
    seen: new Set(),
  };

  function page() { return typeof unsafeWindow !== 'undefined' ? unsafeWindow : window; }
  function loadConfig() { try { return { ...DEFAULT_CONFIG, ...JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}') }; } catch { return { ...DEFAULT_CONFIG }; } }
  function loadLogs() { try { const value = JSON.parse(localStorage.getItem(LOG_KEY) || '[]'); return Array.isArray(value) ? value.slice(-MAX_LOG) : []; } catch { return []; } }
  function saveConfig() { localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config)); }
  function saveLogs() { state.logs = state.logs.slice(-MAX_LOG); localStorage.setItem(LOG_KEY, JSON.stringify(state.logs)); }
  function timestamp() { return new Date().toISOString(); }
  function escape(value) { return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }

  function activity(type, data = {}) {
    const entry = { id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, type, timestamp: timestamp(), ...data };
    if (!state.config.logging) return entry;
    state.logs.push(entry);
    saveLogs();
    if (state.config.relayEnabled && !type.startsWith('relay-')) relay(entry);
    return entry;
  }

  function decode(value) { try { return decodeURIComponent(String(value)); } catch { return String(value); } }

  function normalize(raw) {
    const text = raw?.msg ?? raw?.message ?? raw?.content ?? raw?.text;
    if (typeof text !== 'string' || !text.trim()) return null;
    const message = decode(text).trim();
    const callsign = String(raw.cs ?? raw.callsign ?? raw.username ?? 'unknown').trim();
    const uid = raw.uid ?? raw.userId ?? null;
    const aircraftId = raw.acid ?? raw.aircraftId ?? null;
    const id = String(raw.id ?? raw.messageId ?? `${uid ?? ''}|${aircraftId ?? ''}|${callsign}|${message}`);
    return { id, callsign, uid, aircraftId, message, timestamp: raw.timestamp ?? timestamp(), server: raw.server ?? 'GeoFS' };
  }

  function classify(message) {
    const value = message.toUpperCase();
    if (value.includes('[ADMIN]') || value.includes('[ALERT]')) return 'red';
    if (value.includes('[OPS]') || value.includes('[MISSION]')) return 'yellow';
    if (value.includes('[BAF]') || value.includes('[TRAINING]')) return 'blue';
    return 'green';
  }

  function isBaf(callsign) {
    const value = callsign.toUpperCase();
    return state.config.tags.some((tag) => value.includes(tag.toUpperCase()));
  }

  function receive(raw) {
    const message = normalize(raw);
    if (!message || state.seen.has(message.id)) return;
    if (state.config.mutedUsers.some((user) => user.toLowerCase() === message.callsign.toLowerCase())) return;
    state.seen.add(message.id);
    if (state.seen.size > 4000) state.seen.delete(state.seen.values().next().value);
    message.category = classify(message.message);
    state.messages.push(message);
    state.messages = state.messages.slice(-300);
    if (!isOpen()) state.unread += 1;
    activity('chat', message);
    if (isBaf(message.callsign)) {
      state.pilots.set(message.callsign, { callsign: message.callsign, uid: message.uid, aircraftId: message.aircraftId, lastSeen: message.timestamp, server: message.server });
      activity('pilot-detected', { callsign: message.callsign, uid: message.uid, aircraftId: message.aircraftId });
    }
    updateButton();
    render();
  }

  function pollMultiplayer() {
    const messages = page().multiplayer?.lastRequest?.chatMessages;
    if (!Array.isArray(messages) || !messages.length) return;
    const signature = messages.map((item) => `${item.id ?? ''}|${item.uid ?? ''}|${item.acid ?? ''}|${item.cs ?? ''}|${item.msg ?? ''}`).join('\n');
    if (signature === state.lastBatch) return;
    state.lastBatch = signature;
    messages.forEach(receive);
  }

  function applyFilter(element) {
    const label = element.querySelector('b.label');
    if (!label) return;
    if (!state.config.callsignFilter) {
      label.style.display = '';
      label.style.color = '';
      element.style.color = '';
      return;
    }
    if (label.classList.contains('myself')) {
      label.style.display = '';
      label.style.color = '#8ec5ff';
      return;
    }
    const callsign = (label.getAttribute('callsign') || '').toUpperCase();
    const match = FILTER_TAGS.find((tag) => callsign.includes(tag.toUpperCase()));
    if (!match) {
      label.style.display = 'none';
      element.style.color = '#555';
      return;
    }
    label.style.display = '';
    label.style.color = TAG_COLORS[match.replace(/[\[\]\(\)]/g, '')] || '#d3d3d3';
    element.style.color = '';
  }

  function filterChatDom() { document.querySelectorAll('.geofs-chat-message').forEach(applyFilter); }

  function installChatObserver() {
    const observer = new MutationObserver((records) => {
      records.forEach((record) => record.addedNodes.forEach((node) => {
        if (node.nodeType === Node.ELEMENT_NODE && node.matches?.('.geofs-chat-message')) applyFilter(node);
      }));
      filterChatDom();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    filterChatDom();
  }

  async function relay(entry) {
    if (!state.config.relayUrl || !/^https:\/\//i.test(state.config.relayUrl)) return;
    try {
      const response = await fetch(state.config.relayUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'BOC', channel: 'BAF Operations', ...entry }),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (error) {
      console.warn('[BOC] Relay failed; local log retained.', error);
    }
  }

  function isOpen() { return Boolean(state.panel?.classList.contains('geofs-visible')); }
  function updateButton() { if (state.button) { state.button.querySelector('.boc-unread').hidden = state.unread === 0; state.button.title = state.unread ? `BOC Chat (${state.unread} unread)` : 'BOC Chat'; } }

  function tabs() {
    return ['chat', 'channel', 'ops', 'pilots', 'settings'].map((tab) => `<button class="boc-tab ${state.activeTab === tab ? 'active' : ''}" data-tab="${tab}">${tab === 'chat' ? 'BOC Chat' : tab === 'channel' ? 'BAF Channel' : tab === 'ops' ? 'Operations' : tab === 'pilots' ? 'BAF Pilots' : 'Settings'}</button>`).join('');
  }

  function content() {
    if (state.activeTab === 'chat') return `<input class="boc-search" id="boc-search" placeholder="Search callsign or message" value="${escape(state.search)}">${state.messages.slice().reverse().map(row).join('') || '<div class="boc-empty">Waiting for GeoFS chat</div>'}`;
    if (state.activeTab === 'channel') return `<textarea id="boc-local-input" placeholder="BAF update..."></textarea><button class="boc-primary" data-action="post">Post update</button>${state.messages.filter((item) => isBaf(item.callsign)).slice().reverse().map(row).join('') || '<div class="boc-empty">No BAF messages</div>'}`;
    if (state.activeTab === 'ops') return state.logs.slice().reverse().map((item) => `<div class="boc-log"><time>${escape(new Date(item.timestamp).toLocaleTimeString())}</time><b>${escape(item.type)}</b><span>${escape(item.callsign || item.message || '')}</span></div>`).join('') || '<div class="boc-empty">No activity</div>';
    if (state.activeTab === 'pilots') return [...state.pilots.values()].map((pilot) => `<div class="boc-pilot"><b>${escape(pilot.callsign)}</b><span>UID ${escape(pilot.uid ?? 'unknown')} · aircraft ${escape(pilot.aircraftId ?? 'unknown')}</span></div>`).join('') || '<div class="boc-empty">No BAF pilots detected</div>';
    return `<label><input type="checkbox" data-setting="logging" ${state.config.logging ? 'checked' : ''}> Local activity log</label><label><input type="checkbox" data-setting="callsignFilter" ${state.config.callsignFilter ? 'checked' : ''}> GeoFS callsign filter</label><label><input type="checkbox" data-setting="relayEnabled" ${state.config.relayEnabled ? 'checked' : ''}> Relay to BOC server</label><label>Relay URL<input data-setting="relayUrl" value="${escape(state.config.relayUrl)}"></label><label>Muted callsigns<input data-setting="mutedUsers" value="${escape(state.config.mutedUsers.join(', '))}"></label><button data-action="export">Export activity JSON</button><button data-action="clear">Clear local activity</button>`;
  }

  function row(item) { return `<article class="boc-row ${item.category}"><div><b>${escape(item.callsign)}</b><small>${escape(new Date(item.timestamp).toLocaleTimeString())}</small></div><p>${escape(item.message)}</p></article>`; }

  function render() {
    if (!state.panel) return;
    state.panel.innerHTML = `<div class="boc-shell ${state.config.darkMode ? 'dark' : 'light'}"><header class="boc-head"><b>BOC <small>BAF Operations Client</small></b><button data-action="close">×</button></header><nav>${tabs()}</nav><main>${content()}</main><footer>${state.messages.length} chat messages · ${state.pilots.size} BAF pilots</footer></div>`;
    bind();
  }

  function bind() {
    state.panel.querySelectorAll('[data-tab]').forEach((button) => button.onclick = () => { state.activeTab = button.dataset.tab; render(); });
    state.panel.querySelector('[data-action="close"]')?.addEventListener('click', () => state.button?.click());
    state.panel.querySelector('[data-action="post"]')?.addEventListener('click', () => { const input = state.panel.querySelector('#boc-local-input'); if (input.value.trim()) { receive({ cs: 'BAF', msg: `[BAF] ${input.value.trim()}` }); input.value = ''; } });
    state.panel.querySelector('[data-action="export"]')?.addEventListener('click', () => { const blob = new Blob([JSON.stringify(state.logs, null, 2)], { type: 'application/json' }); GM_download?.({ url: URL.createObjectURL(blob), name: 'boc-activity.json', saveAs: true }); });
    state.panel.querySelector('[data-action="clear"]')?.addEventListener('click', () => { state.logs = []; saveLogs(); render(); });
    const search = state.panel.querySelector('#boc-search');
    if (search) search.oninput = () => { state.search = search.value; const query = state.search.toLowerCase(); state.messages = state.messages.filter((item) => `${item.callsign} ${item.message}`.toLowerCase().includes(query)); render(); };
    state.panel.querySelectorAll('[data-setting]').forEach((input) => input.onchange = () => { const key = input.dataset.setting; state.config[key] = input.type === 'checkbox' ? input.checked : key === 'mutedUsers' ? input.value.split(',').map((value) => value.trim()).filter(Boolean) : input.value; saveConfig(); filterChatDom(); render(); });
  }

  function mount() {
    const leftRail = document.querySelector('.geofs-ui-left');
    if (!leftRail || state.panel) return;
    state.panel = document.createElement('ul');
    state.panel.id = 'boc-root';
    state.panel.className = 'geofs-list geofs-toggle-panel geofs-stopMousePropagation geofs-stopKeyupPropagation boc-list';
    state.panel.dataset.noblur = 'true';
    leftRail.appendChild(state.panel);
    render();
  }

  function mountButton() {
    const leftRail = document.querySelector('.geofs-ui-left');
    if (!leftRail) return setTimeout(mountButton, 500);
    mount();
    if (state.button) return;
    state.button = document.createElement('button');
    state.button.id = 'boc-button';
    state.button.className = 'mdl-button mdl-js-button geofs-f-standard-ui geofs-mediumScreenOnly';
    state.button.type = 'button';
    state.button.dataset.togglePanel = '.boc-list';
    state.button.innerHTML = '<span class="boc-mark">BOC</span><i class="boc-unread" hidden></i>';
    state.button.onclick = () => { state.unread = 0; updateButton(); setTimeout(render, 0); };
    leftRail.insertBefore(state.button, leftRail.firstChild);
    updateButton();
  }

  const css = `#boc-button{display:block;position:relative;margin:4px 8px}.boc-mark{display:inline-flex;border:2px solid #52c4bd;border-radius:3px;padding:2px 6px;font-weight:800}.boc-unread{position:absolute;right:4px;top:4px;width:7px;height:7px;border-radius:50%;background:#ef6974}.boc-shell{width:min(430px,calc(100vw - 24px));height:min(620px,calc(100vh - 110px));min-width:320px;min-height:300px;background:#111820;color:#e7edf5;border:1px solid #344454;border-radius:8px;display:flex;flex-direction:column;overflow:hidden;font:13px/1.4 system-ui}.boc-shell.light{background:#f4f6f8;color:#17232d}.boc-head{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#163b4a}.boc-head small{font-weight:400;opacity:.7}.boc-head button{background:none;border:0;color:inherit;font-size:20px}.boc-shell nav{display:flex;overflow:auto;border-bottom:1px solid #344454}.boc-tab{border:0;background:none;color:#9cb1bd;padding:8px;white-space:nowrap}.boc-tab.active{color:#fff;border-bottom:2px solid #52c4bd}.boc-shell main{flex:1;overflow:auto;padding:8px}.boc-row{border-left:3px solid #63d391;background:#19232c;padding:7px;margin-bottom:5px}.boc-row.blue{border-color:#5ca9ff}.boc-row.yellow{border-color:#e5c55f}.boc-row.red{border-color:#ec6d78}.boc-row b{margin-right:8px}.boc-row small{color:#8297a3}.boc-row p{margin:3px 0}.boc-search,.boc-shell input,.boc-shell textarea{width:100%;box-sizing:border-box;background:#18232c;color:inherit;border:1px solid #344454;border-radius:4px;padding:7px;margin-bottom:7px}.boc-shell label{display:grid;gap:4px;margin:10px 2px}.boc-shell button{cursor:pointer;color:inherit}.boc-primary,.boc-shell [data-action]{background:#263744;border:0;border-radius:4px;padding:7px 9px;margin:3px}.boc-log,.boc-pilot{display:flex;gap:8px;padding:7px;border-bottom:1px solid #293744}.boc-log time{color:#8297a3}.boc-log b{color:#75c5bd}.boc-pilot{flex-direction:column}.boc-pilot span{color:#8297a3}.boc-shell footer{padding:7px;border-top:1px solid #293744;color:#8297a3;font-size:11px}`;

  function start() {
    const style = document.createElement('style');
    style.textContent = css;
    document.head.appendChild(style);
    installChatObserver();
    setInterval(pollMultiplayer, 500);
    if (document.body) mountButton(); else addEventListener('DOMContentLoaded', mountButton, { once: true });
    page().GeoFSChatLogger = { getLogs: () => [...state.logs], clear: () => { state.logs = []; saveLogs(); }, export: () => state.logs };
  }

  start();
})();
