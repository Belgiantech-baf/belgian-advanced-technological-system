(function () {
  const BOC = window.BOC || {};

  class GeoFSAdapter {
    constructor({ core }) {
      this.core = core;
      this.ready = false;
      this.active = false;
      this.observe();
    }

    observe() {
      const root = document.body || document.documentElement;
      if (!root || typeof MutationObserver === 'undefined') {
        this.ready = true;
        return;
      }

      const observer = new MutationObserver(() => {
        const geofsReady = !!window.geofs;
        if (geofsReady && !this.active) {
          this.active = true;
          this.ready = true;
          this.core.sendEvent('GEOFS_READY', { source: 'GeoFS adapter' });
        }
      });

      observer.observe(root, { childList: true, subtree: true });
      this.ready = true;
    }

    readState() {
      return {
        connected: !!window.geofs,
        mode: 'read-only',
        source: 'GeoFS',
      };
    }

    emitSampleMessage() {
      this.core.sendEvent('GEOFS_MESSAGE', {
        channel: 'BAF',
        sender: 'RAVEN',
        callsign: 'BAF-18',
        text: 'GeoFS telemetry synchronized.',
        type: 'baf',
      });
    }
  }

  BOC.Adapter = BOC.Adapter || {};
  BOC.Adapter.GeoFS = GeoFSAdapter;
  window.BOC = BOC;
})();
