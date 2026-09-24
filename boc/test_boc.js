const fs = require('fs');
const vm = require('vm');
const assert = require('assert');

const source = fs.readFileSync(require.resolve('./boc.user.js'), 'utf8');
const storage = new Map();
const listeners = {};
const context = {
  console,
  crypto: { randomUUID: () => 'test-id' },
  Date,
  Math,
  JSON,
  RegExp,
  Blob: function Blob() {},
  URL: { createObjectURL: () => 'blob:test', revokeObjectURL() {} },
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
  },
  document: {
    head: { appendChild() {} },
    body: { appendChild() {} },
    documentElement: { addEventListener() {}, appendChild() {} },
    createElement: () => ({ style: {}, appendChild() {}, addEventListener() {}, querySelectorAll: () => [], querySelector: () => null }),
  },
  window: {
    fetch: async () => ({ clone: () => ({ json: async () => ({}) }) }),
    addEventListener() {},
  },
  XMLHttpRequest: function XMLHttpRequest() {},
  MutationObserver: function MutationObserver() { this.observe = () => {}; },
  Node: { ELEMENT_NODE: 1 },
  GM_registerMenuCommand() {},
  GM_download() {},
};
context.window.window = context.window;
context.window.XMLHttpRequest = context.XMLHttpRequest;
context.XMLHttpRequest.prototype.open = function open() {};
context.XMLHttpRequest.prototype.send = function send() {};
context.XMLHttpRequest.prototype.addEventListener = function addEventListener() {};
vm.createContext(context);
vm.runInContext(source, context, { filename: 'boc.user.js' });

const config = JSON.parse(storage.get('boc.config.v1'));
assert.equal(config.relayEnabled, false);
assert.deepEqual(config.tags, ['[BAF]', '[OPS]', '[ALERT]', '[TRAINING]', '[ADMIN]']);
console.log('PASS configuration defaults persist');
console.log('PASS userscript evaluates without browser network access');
console.log('PASS localStorage integration available');
