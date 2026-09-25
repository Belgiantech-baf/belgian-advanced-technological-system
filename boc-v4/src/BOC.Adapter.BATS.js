(function () {
  const BOC = window.BOC || {};

  class BATSAdapter {
    constructor({ core }) {
      this.core = core;
      this.status = 'disconnected';
      this.modules = new Map();
      this.aircraft = new Map();
      this.listeners = new Map();
      this.connect();
    }

    connect() {
      this.status = 'connected';
      if (this.core && typeof this.core.sendEvent === 'function') {
        this.core.sendEvent('BATS_CONNECTED', { source: 'BATS adapter' });
      }
      return this.status;
    }

    on(type, callback) {
      if (typeof callback !== 'function') return () => {};
      const listeners = this.listeners.get(type) || new Set();
      listeners.add(callback);
      this.listeners.set(type, listeners);
      return () => {
        const next = this.listeners.get(type);
        if (next) {
          next.delete(callback);
          if (!next.size) this.listeners.delete(type);
        }
      };
    }

    emit(type, payload) {
      const listeners = this.listeners.get(type);
      if (listeners) {
        [...listeners].forEach((listener) => { try { listener(payload); } catch (error) { console.warn('[BATS] listener error', error); } });
      }
      return { type, payload };
    }

    registerModule(name, api) {
      this.modules.set(name, api);
      this.emit('MODULE_REGISTERED', { name, api });
      return api;
    }

    sendEvent(type, payload) {
      if (this.core && typeof this.core.sendEvent === 'function') {
        this.core.sendEvent(type, payload);
      }
      this.emit(type, payload);
      return { type, payload };
    }

    receiveEvent(type, payload) {
      return this.sendEvent(type, payload);
    }

    normalizeAircraft(entry) {
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
        status: entry.status ?? (entry.baf ? 'BAF' : 'online'),
        lastUpdate: entry.lastUpdate ?? entry.timestamp ?? new Date().toISOString(),
        baf: Boolean(entry.baf || /\bBAF\b|\[BAF\]/i.test(callsign)),
      };
    }

    setAircraftData(raw) {
      const list = Array.isArray(raw) ? raw : Array.isArray(raw?.aircraft) ? raw.aircraft : [];
      this.aircraft = new Map();
      list.map((entry) => this.normalizeAircraft(entry)).filter(Boolean).forEach((entry) => this.aircraft.set(entry.callsign, entry));
      this.emit('AIRCRAFT_UPDATE', [...this.aircraft.values()]);
      return [...this.aircraft.values()];
    }

    getAircraft() {
      return [...this.aircraft.values()];
    }

    getActivePilots() {
      const active = this.core && typeof this.core.getActivePilots === 'function' ? this.core.getActivePilots() : [];
      if (Array.isArray(active) && active.length) return active;
      return this.getAircraft();
    }

    getOperations() {
      return this.core && typeof this.core.getOperations === 'function' ? this.core.getOperations() : [];
    }

    getAlerts() {
      return this.core && typeof this.core.getAlerts === 'function' ? this.core.getAlerts() : [];
    }
  }

  BOC.Adapter = BOC.Adapter || {};
  BOC.Adapter.BATS = BATSAdapter;
  window.BATS = {
    registerModule(name, api) {
      return BOC.app && BOC.app.bats ? BOC.app.bats.registerModule(name, api) : null;
    },
    sendEvent(type, payload) {
      return BOC.app && BOC.app.bats ? BOC.app.bats.sendEvent(type, payload) : null;
    },
    receiveEvent(type, payload) {
      return BOC.app && BOC.app.bats ? BOC.app.bats.receiveEvent(type, payload) : null;
    },
    getAircraft() {
      return BOC.app && BOC.app.bats ? BOC.app.bats.getAircraft() : [];
    },
    getActivePilots() {
      return BOC.app && BOC.app.bats ? BOC.app.bats.getActivePilots() : [];
    },
    getOperations() {
      return BOC.app && BOC.app.bats ? BOC.app.bats.getOperations() : [];
    },
    getAlerts() {
      return BOC.app && BOC.app.bats ? BOC.app.bats.getAlerts() : [];
    },
    setAircraftData(raw) {
      return BOC.app && BOC.app.bats ? BOC.app.bats.setAircraftData(raw) : [];
    },
    on(type, callback) {
      return BOC.app && BOC.app.bats ? BOC.app.bats.on(type, callback) : () => {};
    },
    emit(type, payload) {
      return BOC.app && BOC.app.bats ? BOC.app.bats.emit(type, payload) : null;
    }
  };
  window.BOC = BOC;
})();
