(function () {
  const BOC = window.BOC || {};

  class BOCOperations {
    constructor({ core }) {
      this.core = core;
      this.list = [];
    }

    addMission(mission) {
      const operation = {
        id: mission.id || Date.now() + Math.random(),
        name: mission.name || 'Unknown Mission',
        location: mission.location || 'TBD',
        status: mission.status || 'Queued',
        time: mission.time || 'TBD',
      };
      this.list.push(operation);
      this.core.registerOperation(operation);
      return operation;
    }

    onEvent(type, payload) {
      if (type === 'MISSION_UPDATE') {
        this.addMission(payload);
      }
    }
  }

  BOC.Operations = BOCOperations;
  window.BOC = BOC;
})();
