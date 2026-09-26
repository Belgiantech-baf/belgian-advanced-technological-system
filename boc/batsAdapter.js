(function (global) {
  'use strict';

  const DEFAULT_BAF_TAGS = ['[BAF]', '[OPS]', '[ADMIN]', '[TRAINING]'];

  class BATSAdapter {
    constructor({ core = {}, tags = DEFAULT_BAF_TAGS } = {}) {
      this.core = core || {};
      this.tags = Array.isArray(tags) && tags.length ? tags : DEFAULT_BAF_TAGS;
      this.listeners = new Map();
      this.pilots = new Map();
      this.aircraft = new Map();
      this.operations = Array.isArray(this.core?.operations) ? this.core.operations.slice() : [];
      this.status = 'connected';
      this.generatedAt = new Date().toISOString();
    }

    static isBafCallsign(callsign, tags = DEFAULT_BAF_TAGS) {
      if (!callsign) return false;
      const value = String(callsign).toUpperCase();
      const configured = Array.isArray(tags) ? tags : DEFAULT_BAF_TAGS;
      const tagMatch = configured.some((tag) => value.includes(String(tag).toUpperCase()));
      return tagMatch || /\b(?:BAF|OPS|ADMIN|TRAINING)\b/i.test(value);
    }

    normalize(entry) {
      if (!entry || typeof entry !== 'object') return null;
      const callsign = String(entry.callsign ?? entry.cs ?? entry.username ?? entry.name ?? '').trim();
      if (!callsign) return null;
      const normalized = {
        id: entry.id ?? entry.aircraftId ?? entry.acid ?? callsign,
        callsign,
        username: entry.username ?? entry.user ?? entry.callsign ?? callsign,
        aircraft: entry.aircraft ?? entry.aircraftType ?? entry.model ?? 'Unknown',
        latitude: entry.latitude ?? entry.lat ?? entry.position?.lat ?? null,
        longitude: entry.longitude ?? entry.lon ?? entry.position?.lon ?? null,
        altitude: entry.altitude ?? entry.alt ?? entry.altitudeFt ?? null,
        heading: entry.heading ?? entry.hdg ?? entry.course ?? null,
        speed: entry.speed ?? entry.airspeed ?? entry.velocity ?? null,
        server: entry.server ?? 'GeoFS',
        lastUpdate: entry.lastUpdate ?? entry.timestamp ?? new Date().toISOString(),
        status: entry.status ?? (entry.baf || BATSAdapter.isBafCallsign(callsign, this.tags) ? 'BAF' : 'online'),
        baf: Boolean(entry.baf || BATSAdapter.isBafCallsign(callsign, this.tags)),
      };
      return normalized;
    }

    ingestSnapshot(raw) {
      const list = Array.isArray(raw) ? raw : Array.isArray(raw?.aircraft) ? raw.aircraft : [];
      const normalized = list.map((entry) => this.normalize(entry)).filter(Boolean);
      this.pilots = new Map();
      this.aircraft = new Map();
      normalized.forEach((entry) => {
        this.pilots.set(entry.callsign, entry);
        this.aircraft.set(entry.id, entry);
      });
      this.generatedAt = new Date().toISOString();
      this.emit('AIRCRAFT_UPDATE', this.getRadarData());
      return this.getRadarData();
    }

    subscribe(type, listener) {
      if (typeof listener !== 'function') return () => {};
      const listeners = this.listeners.get(type) || new Set();
      listeners.add(listener);
      this.listeners.set(type, listeners);
      return () => this.unsubscribe(type, listener);
    }

    unsubscribe(type, listener) {
      const listeners = this.listeners.get(type);
      if (!listeners) return false;
      listeners.delete(listener);
      if (!listeners.size) this.listeners.delete(type);
      return true;
    }

    emit(type, payload) {
      const listeners = this.listeners.get(type);
      if (!listeners) return { type, payload };
      [...listeners].forEach((listener) => {
        try { listener(payload); } catch (error) { console.warn('[BATS] listener error', error); }
      });
      return { type, payload };
    }

    setOperations(raw) {
      this.operations = Array.isArray(raw) ? raw : [];
      this.emit('OPERATIONS_UPDATE', this.getRadarData());
      return this.operations;
    }

    getPilots() {
      return [...this.pilots.values()];
    }

    getTrackedAircraft() {
      return [...this.aircraft.values()];
    }

    getActiveBAF() {
      return this.getPilots().filter((entry) => Boolean(entry.baf) || BATSAdapter.isBafCallsign(entry.callsign, this.tags));
    }

    getOperations() {
      if (this.core && typeof this.core.getOperations === 'function') {
        const operations = this.core.getOperations();
        if (Array.isArray(operations)) return operations;
      }
      return this.operations.slice();
    }

    getRadarData() {
      const trackedAircraft = this.getTrackedAircraft();
      const activeBAF = this.getActiveBAF();
      const operations = this.getOperations();
      return {
        trackedAircraft,
        activeBAF,
        operations,
        generatedAt: this.generatedAt,
        source: 'BATS',
      };
    }
  }

  global.BATSAdapter = BATSAdapter;
  global.BATS = global.BATS || {
    registerModule(name, api) { return api; },
    sendEvent(type, payload) { return { type, payload }; },
    receiveEvent(type, payload) { return { type, payload }; },
    getAircraft() { return []; },
    getActivePilots() { return []; },
    getOperations() { return []; },
    getAlerts() { return []; },
    setAircraftData(raw) { return raw || []; },
    on(type, callback) { return () => {}; },
    emit(type, payload) { return { type, payload }; },
  };

  if (global.BOC) {
    global.BOC.Adapter = global.BOC.Adapter || {};
    global.BOC.Adapter.BATS = BATSAdapter;
    global.BOC.BATSAdapter = BATSAdapter;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { BATSAdapter };
  }
})(typeof window !== 'undefined' ? window : globalThis);
