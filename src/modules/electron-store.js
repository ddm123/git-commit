const ElectronStore = require('electron-store');

module.exports = class extends ElectronStore {
  static #_singleton = null;

  static get singleton() {
    if (!this.#_singleton) {
      this.#_singleton = this.factory();
    }
    return this.#_singleton;
  }

  static factory(options) {
    options ??= {};
    options.serialize ??= value => JSON.stringify(value);
    //options.encryptionKey ??= '加密密钥';

    return new this(options);
  }

  getFloatValue(key, defaultValue = undefined) {
    let value = this.get(key, defaultValue);
    if (value === undefined || value === null) {
      return defaultValue;
    }
    if (value === false || value === '') {
      return 0;
    }
    if (typeof value === 'string') {
      value = parseFloat(value);
    }
    return isNaN(value) ? 0 : value;
  }

  getIntValue(key, defaultValue = undefined) {
    let value = this.getFloatValue(key, defaultValue);
    return typeof value === 'number' ? Math.floor(value) : value;
  }

  setFloatValue(key, value) {
    if (value === undefined || value === null) {
      this.delete(key);
      return this;
    }

    if (value === false || value === '') {
      value = 0;
    } else if (typeof value === 'string') {
      value = parseFloat(value);
      if (isNaN(value)) {
        value = 0;
      }
    }

    this.set(key, value);

    return this;
  }

  setIntValue(key, value) {
    const type = typeof value;

    if (type === 'string' || type === 'number') {
      value = value === '' ? 0 : parseInt(value);
      if (isNaN(value)) {
        value = 0;
      }
    }

    return this.setFloatValue(key, value);
  }

  setJSON(key, value) {
    if (value === undefined || value === null) {
      this.delete(key);
      return this;
    }

    if (typeof value === 'string') {
      try {
        value = JSON.parse(value);
      } catch (e) {
        value = {};
      }
    }

    //if (typeof value !== 'object') {
    //  value = {};
    //}

    this.set(key, value);

    return this;
  }
};