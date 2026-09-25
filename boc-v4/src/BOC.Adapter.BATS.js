(function () {
  const BOC = window.BOC || {};

  class BATSAdapter {
    constructor({ core }) {
      this.core = core;
      this.status = 'disconnected';
      this.modules = new Map();
      this.connect();
    }

    connect() {
      this.status = 'connected';
      this.core.sendEvent('BATS_CONNECTED', { source: 'BATS adapter' });
      return this.status;
    }

    registerModule(name, api) {
      this.modules.set(name, api);
      return api;
    }

    sendEvent(type, payload) {
      this.core.sendEvent(type, payload);
      return { type, payload };
    }

    receiveEvent(type, payload) {
      return this.sendEvent(type, payload);
    }

    getActivePilots() {
      return this.core.getActivePilots();
    }

    getOperations() {
      return this.core.getOperations();
    }

    getAlerts() {
      return this.core.getAlerts();
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
    getActivePilots() {
      return BOC.app && BOC.app.bats ? BOC.app.bats.getActivePilots() : [];
    },
    getOperations() {
      return BOC.app && BOC.app.bats ? BOC.app.bats.getOperations() : [];
    },
    getAlerts() {
      return BOC.app && BOC.app.bats ? BOC.app.bats.getAlerts() : [];
    }
  };
  window.BOC = BOC;
})();
