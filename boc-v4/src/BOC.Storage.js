(function () {
  const BOC = window.BOC || {};

  class BOCStorage {
    constructor() {
      this.db = null;
      this.localKey = 'BOC.v4.store';
      this.memory = {};
      this.init();
    }

    init() {
      try {
        const json = localStorage.getItem(this.localKey);
        if (json) {
          this.memory = JSON.parse(json);
        }
      } catch (error) {
        this.memory = {};
      }
    }

    read(key, fallback = null) {
      const value = this.memory[key];
      return value === undefined ? fallback : value;
    }

    write(key, value) {
      this.memory[key] = value;
      try {
        localStorage.setItem(this.localKey, JSON.stringify(this.memory));
      } catch (error) {
        console.warn('BOC storage write failed:', error);
      }
      return value;
    }

    remove(key) {
      delete this.memory[key];
      try {
        localStorage.setItem(this.localKey, JSON.stringify(this.memory));
      } catch (error) {
        // intentionally ignored
      }
    }

    async getIndexed(key, fallback = null) {
      return this.read(key, fallback);
    }

    async saveIndexed(key, value) {
      return this.write(key, value);
    }
  }

  BOC.Storage = BOCStorage;
  window.BOC = BOC;
})();
