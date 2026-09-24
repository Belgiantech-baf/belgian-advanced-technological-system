import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeMessage, createCollector } from '../src/collector.js';

test('normalizes documented GeoFS chat fields without changing message content', () => {
  const message = normalizeMessage({ id: 42, cs: 'BAF001', uid: '123456', acid: 7, msg: 'Requesting departure', server: 'GeoFS' });
  assert.deepEqual(message, {
    sourceId: '42',
    dedupeKey: 'id:42',
    timestamp: message.timestamp,
    callsign: 'BAF001',
    uid: '123456',
    aircraftId: '7',
    message: 'Requesting departure',
    server: 'GeoFS',
    createdAt: message.createdAt,
  });
});

test('decodes encoded message content and uses null for missing identifiers', () => {
  const message = normalizeMessage({ msg: 'Requesting%20departure', cs: 'BAF001' });
  assert.equal(message.message, 'Requesting departure');
  assert.equal(message.uid, null);
  assert.equal(message.aircraftId, null);
});

test('publishes only newly inserted messages', () => {
  const inserted = new Set();
  const repository = {
    insertMany: (messages) => {
      const keys = messages.filter((message) => !inserted.has(message.dedupeKey)).map((message) => message.dedupeKey);
      keys.forEach((key) => inserted.add(key));
      return { count: keys.length, keys };
    },
  };
  const published = [];
  const collector = createCollector({ repository, publish: (event) => published.push(event), logger: { info() {} } });
  const payload = { id: 'same', cs: 'BAF001', uid: 'u1', acid: 7, msg: 'same message' };
  assert.equal(collector.ingest(payload).stored, 1);
  assert.equal(collector.ingest(payload).stored, 0);
  assert.equal(published.length, 1);
});
