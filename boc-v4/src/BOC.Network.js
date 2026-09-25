(function () {
  const BOC = window.BOC || {};

  class BOCNetwork {
    constructor({ core }) {
      this.core = core;
      this.status = {
        connected: false,
        latency: 0,
        channels: [],
      };
    }

    setStatus(status) {
      this.status = { ...this.status, ...status };
      return this.status;
    }

    send(message) {
      this.core.sendEvent('NETWORK_MESSAGE', message);
      return message;
    }
  }

  BOC.Network = BOCNetwork;
  window.BOC = BOC;
})();
