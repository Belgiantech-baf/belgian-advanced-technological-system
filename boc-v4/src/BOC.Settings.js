(function () {
  const BOC = window.BOC || {};

  class BOCSettings {
    constructor(storage) {
      this.storage = storage || new BOC.Storage();
      this.defaults = {
        theme: 'dark',
        notifications: true,
        audioAlerts: false,
        dock: 'center',
        layout: {},
        channels: ['BAF', 'Operations', 'Training', 'Intel', 'System'],
      };
      this.values = this.load();
    }

    load() {
      const saved = this.storage.read('settings', {});
      return { ...this.defaults, ...saved };
    }

    save() {
      this.storage.write('settings', this.values);
      return this.values;
    }

    get(key) {
      return this.values[key];
    }

    set(key, value) {
      this.values[key] = value;
      this.save();
      return this.values;
    }
  }

  BOC.Settings = BOCSettings;
  window.BOC = BOC;
})();
