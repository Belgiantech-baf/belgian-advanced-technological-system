(function () {
  const BOC = window.BOC || {};

  class BOCDiagnostics {
    constructor({ core }) {
      this.core = core;
      this.summary = [];
      this.logs = [];
    }

    setSummary(items) {
      this.summary = items;
      return this.summary;
    }

    appendLog(entry) {
      this.logs.push({
        time: Date.now(),
        message: entry,
      });
      return this.logs;
    }

    onEvent(type, payload) {
      this.appendLog(`${type}: ${JSON.stringify(payload)}`);
    }
  }

  BOC.Diagnostics = BOCDiagnostics;
  window.BOC = BOC;
})();
