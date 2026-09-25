import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBafChatMessage, normalizeBafChatMessage } from '../src/collector.js';

test('accepts a valid BAF chat payload and normalizes it for the live chat channel', () => {
  const payload = {
    channel: 'BAF CHAT',
    callsign: 'BAF-14',
    username: 'MARA',
    message: 'Ops board synced. Ready for launch.',
    source: 'BAF_CHAT',
    server: 'BOC Server',
  };
  const result = validateBafChatMessage(payload);
  assert.equal(result.valid, true);
  const normalized = normalizeBafChatMessage(payload);
  assert.equal(normalized.callsign, 'BAF-14');
  assert.equal(normalized.message, 'Ops board synced. Ready for launch.');
  assert.equal(normalized.server, 'BOC Server');
});

test('rejects empty or overlong BAF chat messages', () => {
  assert.deepEqual(validateBafChatMessage({ callsign: 'BAF-14', message: '' }).valid, false);
  assert.deepEqual(validateBafChatMessage({ callsign: 'BAF-14', message: 'x'.repeat(6000) }).valid, false);
  assert.deepEqual(validateBafChatMessage({ callsign: '', message: 'hello' }).valid, false);
});
