import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldForwardDiscordEvent, toDiscordRelayPayload } from '../src/discordRelay.js';

test('forwards both standard and BAF chat events to the Discord relay', () => {
  assert.equal(shouldForwardDiscordEvent('chat.message'), true);
  assert.equal(shouldForwardDiscordEvent('baf.chat'), true);
  assert.equal(shouldForwardDiscordEvent('ready'), false);
});

test('builds the Discord payload from BAF chat records', () => {
  const payload = toDiscordRelayPayload({
    callsign: 'BAF-14',
    message: 'Ops board synced',
    server: 'BOC Server',
    uid: 'u-42',
    aircraftId: 'ac-7',
    timestamp: '2026-09-25T12:00:00Z',
  });

  assert.deepEqual(payload, {
    type: 'chat',
    username: 'BAF-14',
    message: 'Ops board synced',
    timestamp: '2026-09-25T12:00:00Z',
    server: 'BOC Server',
    uid: 'u-42',
    aircraftId: 'ac-7',
  });
});
