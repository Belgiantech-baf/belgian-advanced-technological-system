import test from 'node:test';
import assert from 'node:assert/strict';
import { GeoFSBridgeServer } from '../server/websocket.js';
import { normalizePlayer, normalizeChat, MESSAGE_TYPES } from '../shared/protocol.js';

test('normalizePlayer handles GeoFS-style user payloads', () => {
  const player = normalizePlayer({
    id: 'abc',
    acid: 123,
    cs: 'AIX123',
    ac: 27,
    co: [35.5, 139.7, 35000, 90, 2, 0],
    ve: { as: 450 },
    st: { gr: 0 },
    ti: 1700000000,
  });

  assert.equal(player.callsign, 'AIX123');
  assert.equal(player.latitude, 35.5);
  assert.equal(player.altitude, 35000);
  assert.equal(player.speed, 450);
  assert.equal(player.heading, 90);
});

test('normalizeChat decodes encoded message text', () => {
  const chat = normalizeChat({
    uid: 'u1',
    acid: 123,
    cs: 'AIX123',
    msg: 'Hello%20Discord%21',
    timestamp: 1,
  });

  assert.equal(chat.type, MESSAGE_TYPES.GEOFS_CHAT);
  assert.equal(chat.message, 'Hello Discord!');
});

test('dotenv loads runtime values from the local .env file', async () => {
  await import('dotenv/config');
  assert.ok(process.env.BRIDGE_SECRET, 'BRIDGE_SECRET should be loaded from .env');
  assert.ok(process.env.DISCORD_BOT_TOKEN, 'DISCORD_BOT_TOKEN should be loaded from .env');
});

test('bridge server authenticates and handles player updates', () => {
  const bridge = new GeoFSBridgeServer({ port: 0, bridgeSecret: 'secret' });
  const ws = bridge.start();
  assert.ok(ws);
  bridge.handleIncoming({ isAuthorized: true, send: () => {}, subscriptions: new Set() }, {
    type: MESSAGE_TYPES.GEO_UPDATE,
    player: {
      id: 'p1',
      acid: 123,
      callsign: 'AIX123',
      ac: 27,
      co: [35.5, 139.7, 35000, 90, 2, 0],
      ve: { as: 450 },
      st: { gr: 0 },
      ti: 1700000000,
    }
  });

  assert.equal(bridge.state.players.size, 1);
  bridge.server.close();
});
