(function () {
  const BOC = window.BOC || {};

  class BOCCore {
    constructor({ storage, settings } = {}) {
      this.storage = storage || null;
      this.settings = settings || null;
      this.modules = new Map();
      this.pilots = new Map();
      this.operations = new Map();
      this.alerts = new Map();
      this.messages = [];
      this.ready = false;
      this.events = [];
    }

    registerModule(name, instance) {
      this.modules.set(name, instance);
      return instance;
    }

    boot() {
      this.ready = true;
      this.sendEvent('BOOTSTRAP_COMPLETE', { time: Date.now() });
      return this;
    }

    sendEvent(type, payload = {}) {
      const event = { type, payload, time: Date.now() };
      this.events.push(event);
      this.modules.forEach((module) => {
        if (typeof module.onEvent === 'function') {
          module.onEvent(type, payload, event);
        }
      });
      return event;
    }

    receiveEvent(type, payload = {}) {
      return this.sendEvent(type, payload);
    }

    registerPilot(pilot) {
      this.pilots.set(String(pilot.id || pilot.username), pilot);
      return pilot;
    }

    getActivePilots() {
      return Array.from(this.pilots.values());
    }

    registerOperation(operation) {
      this.operations.set(String(operation.id || operation.name), operation);
      return operation;
    }

    getOperations() {
      return Array.from(this.operations.values());
    }

    registerAlert(alert) {
      this.alerts.set(String(alert.id || alert.type), alert);
      return alert;
    }

    getAlerts() {
      return Array.from(this.alerts.values());
    }
  }

  BOC.Core = BOCCore;
  window.BOC = BOC;
})();
