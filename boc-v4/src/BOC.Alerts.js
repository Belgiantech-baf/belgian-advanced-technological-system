(function () {
  const BOC = window.BOC || {};

  class BOCAlerts {
    constructor({ core }) {
      this.core = core;
      this.list = [];
    }

    addAlert(alert) {
      const item = {
        id: alert.id || Date.now() + Math.random(),
        type: alert.type || 'System Alert',
        severity: alert.severity || 'blue',
        state: alert.state || 'Pending',
        text: alert.text || 'Alert received',
      };
      this.list.push(item);
      this.core.registerAlert(item);
      return item;
    }

    onEvent(type, payload) {
      if (type === 'ALERT') {
        this.addAlert(payload);
      }
    }
  }

  BOC.Alerts = BOCAlerts;
  window.BOC = BOC;
})();
