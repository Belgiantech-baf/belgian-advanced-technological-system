(function () {
  const BOC = window.BOC || {};

  class BOCPilots {
    constructor({ core }) {
      this.core = core;
      this.filter = 'All';
      this.lastUpdated = Date.now();
    }

    registerPilot(pilot) {
      this.core.registerPilot(pilot);
      this.lastUpdated = Date.now();
      return pilot;
    }

    setFilter(filter) {
      this.filter = filter;
      return filter;
    }

    getVisible() {
      const pilots = this.core.getActivePilots();
      if (this.filter === 'All') return pilots;
      return pilots.filter((pilot) => pilot.status === this.filter);
    }
  }

  BOC.Pilots = BOCPilots;
  window.BOC = BOC;
})();
