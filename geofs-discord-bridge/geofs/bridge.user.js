(function () {
  'use strict';

  const BRIDGE_URL = 'ws://localhost:3000';
  const BRIDGE_SECRET = '7f2a8c91-5be2-4d42-a3d9-8b9dc6e86d2e';
  const state = {
    socket: null,
    connected: false,
    lastChatMessageId: 0,
    players: new Map(),
    callbacks: {
      update: [],
      chat: [],
    },
  };

  function safeCall(list, payload) {
    list.slice().forEach((cb) => {
      try { cb(payload); } catch (error) { console.warn('[GeoFS bridge] callback failed', error); }
    });
  }

  function normalizeIncomingUser(user = {}) {
    const co = Array.isArray(user.co) ? user.co : [0, 0, 0, 0, 0, 0];
    const ve = user.ve || {};
    const st = user.st || {};
    return {
      id: String(user.id ?? user.uid ?? user.userId ?? ''),
      acid: Number(user.acid ?? user.aircraftId ?? 0) || 0,
      callsign: String(user.cs ?? user.callsign ?? user.username ?? 'UNKNOWN').trim(),
      aircraft: Number(user.ac ?? user.aircraft ?? 0) || 0,
      latitude: Number(co[0] ?? 0),
      longitude: Number(co[1] ?? 0),
      altitude: Number(co[2] ?? 0),
      heading: Number(co[3] ?? 0),
      pitch: Number(co[4] ?? 0),
      roll: Number(co[5] ?? 0),
      speed: Number(ve.as ?? st.as ?? 0),
      gear: Number(st.gr ?? 0),
      lastSeen: Date.now(),
    };
  }

  function buildGeoUpdate() {
    if (!window.geofs?.aircraft?.instance) return null;

    const instance = window.geofs.aircraft.instance;
    const lla = Array.isArray(instance.llaLocation) ? instance.llaLocation : [0, 0, 0];
    const htr = Array.isArray(instance.htr) ? instance.htr : [0, 0, 0];
    const aircraft = instance.aircraftRecord || {};
    return {
      type: 'geo_update',
      player: {
        id: String(window.multiplayer?.myId ?? window.geofs?.userRecord?.id ?? ''),
        acid: Number(window.geofs?.userRecord?.id ?? 0) || 0,
        callsign: String(window.multiplayer?.currentUser?.cs ?? window.geofs?.userRecord?.callsign ?? 'UNKNOWN').trim(),
        aircraft: Number(aircraft.id ?? 0) || 0,
        latitude: Number(lla[0] ?? 0),
        longitude: Number(lla[1] ?? 0),
        altitude: Number(lla[2] ?? 0),
        heading: Number(htr[0] ?? 0),
        pitch: Number(htr[1] ?? 0),
        roll: Number(htr[2] ?? 0),
        speed: Number(window.geofs?.animation?.values?.kias ?? 0),
        gear: Number(instance.groundContact ? 0 : 1),
        source: 'geofs',
      },
      timestamp: Date.now(),
    };
  }

  function connect() {
    if (state.socket) return;
    const socket = new WebSocket(BRIDGE_URL);
    state.socket = socket;

    socket.addEventListener('open', () => {
      state.connected = true;
      socket.send(JSON.stringify({ type: 'identify', token: BRIDGE_SECRET, client: 'geofs' }));
      const update = buildGeoUpdate();
      if (update) socket.send(JSON.stringify(update));
    });

    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'discord_chat' && message.message) {
          if (window.multiplayer && typeof window.multiplayer.setChatMessage === 'function') {
            window.multiplayer.setChatMessage(message.message);
          }
        }

        if (message.type === 'ping') {
          socket.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        }

        if (message.type === 'player_update' && message.player) {
          const normalized = normalizeIncomingUser(message.player);
          state.players.set(normalized.id, normalized);
          safeCall(state.callbacks.update, normalized);
        }
      } catch (error) {
        console.warn('[GeoFS bridge] message error', error);
      }
    });

    socket.addEventListener('close', () => {
      state.connected = false;
      state.socket = null;
      setTimeout(connect, 2000);
    });
  }

  function onUpdate(callback) {
    if (typeof callback === 'function') state.callbacks.update.push(callback);
    return () => {
      state.callbacks.update = state.callbacks.update.filter((fn) => fn !== callback);
    };
  }

  function onChat(callback) {
    if (typeof callback === 'function') state.callbacks.chat.push(callback);
    return () => {
      state.callbacks.chat = state.callbacks.chat.filter((fn) => fn !== callback);
    };
  }

  const GeoFSMultiplayer = {
    getPlayers() {
      const entries = [...state.players.values()];
      return entries.length ? entries : [];
    },
    getVisiblePlayers() { return this.getPlayers(); },
    getPlayer(id) { return state.players.get(String(id)) || null; },
    getLocalPlayer() { return this.getPlayer(window.multiplayer?.myId || window.geofs?.userRecord?.id || ''); },
    getMyId() { return window.multiplayer?.myId || window.geofs?.userRecord?.id || ''; },
    getServerTime() { return window.multiplayer?.getServerTime?.() || Date.now(); },
    getPing() { return window.multiplayer?.avgPing || 0; },
    getPlayerCount() { return this.getPlayers().length || window.multiplayer?.nbUsers || 0; },
    getLastResponse() { return window.multiplayer?.lastResponse || null; },
    sendChat(message) {
      if (window.multiplayer && typeof window.multiplayer.setChatMessage === 'function') {
        window.multiplayer.setChatMessage(message);
      }
      if (state.socket && state.connected) {
        state.socket.send(JSON.stringify({ type: 'geofs_chat', playerId: this.getMyId(), callsign: 'UNKNOWN', message }));
      }
    },
    onUpdate,
    onChat,
  };

  window.GeoFSMultiplayer = GeoFSMultiplayer;
  window.addEventListener('load', () => {
    setInterval(() => {
      if (!state.socket || !state.socket.readyState || state.socket.readyState !== WebSocket.OPEN) return;
      const update = buildGeoUpdate();
      if (update) state.socket.send(JSON.stringify(update));
    }, 3000);
  });

  connect();
})();
