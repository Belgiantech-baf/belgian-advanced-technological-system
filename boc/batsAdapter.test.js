const test = require('node:test');
const assert = require('node:assert/strict');
const { BATSAdapter } = require('./batsAdapter.js');

test('BATS adapter exposes live pilot, radar and BAF data', () => {
  const adapter = new BATSAdapter({ core: { getOperations: () => [{ id: 'op-1', title: 'PATROL' }] } });

  adapter.ingestSnapshot([
    {
      id: 'p1',
      callsign: '[BAF] BLUE 01',
      username: 'pilot-one',
      aircraft: 'F-16',
      latitude: 50.5,
      longitude: 4.5,
      altitude: 25000,
      heading: 120,
      speed: 450,
      server: 'GeoFS',
      lastUpdate: '2026-01-01T00:00:00Z',
      baf: true,
    },
    {
      id: 'p2',
      callsign: 'CIV-777',
      username: 'civ-pilot',
      aircraft: 'A320',
      latitude: 50.6,
      longitude: 4.6,
      altitude: 28000,
      heading: 90,
      speed: 480,
      server: 'GeoFS',
      lastUpdate: '2026-01-01T00:01:00Z',
    },
  ]);

  assert.equal(typeof adapter.getPilots, 'function');
  assert.equal(typeof adapter.getTrackedAircraft, 'function');
  assert.equal(typeof adapter.getActiveBAF, 'function');
  assert.equal(typeof adapter.getRadarData, 'function');
  assert.equal(typeof adapter.subscribe, 'function');
  assert.equal(typeof adapter.unsubscribe, 'function');

  const pilots = adapter.getPilots();
  const active = adapter.getActiveBAF();
  const radar = adapter.getRadarData();

  assert.equal(pilots.length, 2);
  assert.equal(active.length, 1);
  assert.equal(active[0].callsign, '[BAF] BLUE 01');
  assert.equal(radar.activeBAF.length, 1);
  assert.equal(radar.operations.length, 1);
  assert.equal(radar.trackedAircraft.length, 2);
});
