(function () {
  const BOC = window.BOC || {};

  class BOCChat {
    constructor({ core }) {
      this.core = core;
      this.messages = [];
      this.filters = new Set(['BAF', 'Operations', 'Training', 'System']);
    }

    addMessage(message) {
      const record = {
        id: message.id || Date.now() + Math.random(),
        channel: message.channel || 'BAF',
        sender: message.sender || 'System',
        callsign: message.callsign || 'N/A',
        text: message.text || '',
        type: message.type || 'baf',
        stamp: message.stamp || Date.now(),
      };
      this.messages.push(record);
      this.core.messages = this.messages;
      this.core.sendEvent('CHAT_MESSAGE', record);
      return record;
    }

    onEvent(type, payload) {
      if (type === 'GEOFS_MESSAGE') {
        this.addMessage({
          channel: payload.channel || 'BAF',
          sender: payload.sender || 'GeoFS',
          callsign: payload.callsign || 'N/A',
          text: payload.text || '',
          type: payload.type || 'baf',
          stamp: Date.now(),
        });
      }
    }
  }

  BOC.Chat = BOCChat;
  window.BOC = BOC;
})();
