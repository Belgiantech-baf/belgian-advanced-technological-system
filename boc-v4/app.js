(function () {
  window.BOC = window.BOC || {};

  const storage = new window.BOC.Storage();
  const settings = new window.BOC.Settings(storage);
  const core = new window.BOC.Core({ storage, settings });
  const ui = new window.BOC.UI({ core, storage, settings });
  const chat = new window.BOC.Chat({ core, storage, settings });
  const pilots = new window.BOC.Pilots({ core, storage, settings });
  const operations = new window.BOC.Operations({ core, storage, settings });
  const alerts = new window.BOC.Alerts({ core, storage, settings });
  const diagnostics = new window.BOC.Diagnostics({ core, storage, settings });
  const network = new window.BOC.Network({ core, storage, settings });
  const geoFS = new window.BOC.Adapter.GeoFS({ core, storage, settings });
  const bats = new window.BOC.Adapter.BATS({ core, storage, settings });

  core.boot();
  core.registerModule('BOC.UI', ui);
  core.registerModule('BOC.Chat', chat);
  core.registerModule('BOC.Pilots', pilots);
  core.registerModule('BOC.Operations', operations);
  core.registerModule('BOC.Alerts', alerts);
  core.registerModule('BOC.Diagnostics', diagnostics);
  core.registerModule('BOC.Network', network);
  core.registerModule('BOC.Adapter.GeoFS', geoFS);
  core.registerModule('BOC.Adapter.BATS', bats);

  window.BOC.app = { core, ui, chat, pilots, operations, alerts, diagnostics, network, geoFS, bats, settings, storage };

  const seededMessages = [
    { id: 1, channel: '#operations', sender: 'MARA', callsign: 'BAF-14', text: 'Ops board synced. Patrol route is live.', type: 'baf', stamp: Date.now() - 1000 * 60 * 3 },
    { id: 2, channel: '#training', sender: 'KAI', callsign: 'TRN-02', text: 'Training board updated. Queue confirmed for 20:30Z.', type: 'training', stamp: Date.now() - 1000 * 60 * 8 },
    { id: 3, channel: '#intel', sender: 'ORBIT', callsign: 'OPS-01', text: 'Regional activity is stable across the north corridor.', type: 'operations', stamp: Date.now() - 1000 * 60 * 12 },
    { id: 4, channel: '#admin', sender: 'BOC', callsign: 'SYS', text: 'BOC v4.0 Ready. Belgian Tech Systems online.', type: 'system', stamp: Date.now() - 1000 * 60 * 16 },
  ];

  const seededAlerts = [
    { id: 1, type: 'BAF Online', severity: 'green', state: 'Acknowledged', text: 'BAF presence confirmed across the live server.' },
    { id: 2, type: 'Operation Start', severity: 'orange', state: 'Pending', text: 'Operation Atlas is active in the north corridor.' },
    { id: 3, type: 'Admin Notice', severity: 'red', state: 'Pending', text: 'High-priority administrative notice requires review.' },
  ];

  const seededPilots = [
    { id: 1, username: 'MARA', rank: 'Captain', callsign: 'BAF-14', aircraft: 'A320', altitude: '12,400 ft', server: 'BATS West', lastSeen: '2 min ago', status: 'Online', group: 'BAF' },
    { id: 2, username: 'KAI', rank: 'Instructor', callsign: 'TRN-02', aircraft: 'A330', altitude: '8,700 ft', server: 'Training Ring', lastSeen: '4 min ago', status: 'Training', group: 'Training' },
    { id: 3, username: 'ORBIT', rank: 'Ops Lead', callsign: 'OPS-01', aircraft: 'E175', altitude: '7,300 ft', server: 'Ops Hub', lastSeen: '1 min ago', status: 'Operations', group: 'Operations' },
    { id: 4, username: 'SABLE', rank: 'Watcher', callsign: 'INT-90', aircraft: 'B738', altitude: '9,900 ft', server: 'Intel Grid', lastSeen: '6 min ago', status: 'Away', group: 'Intel' },
  ];

  const seededOperations = [
    { id: 1, name: 'Operation Atlas', location: 'North Corridor', status: 'Live', time: '20:15Z', type: 'Patrol' },
    { id: 2, name: 'Training Squadron 7', location: 'Bravo Range', status: 'Queued', time: '20:30Z', type: 'Training' },
    { id: 3, name: 'Intel Sweep', location: 'Metro Sector', status: 'Monitoring', time: '21:00Z', type: 'Intel' },
  ];

  const seededRadar = [
    { callsign: 'BAF-14', altitude: '12,400 ft', aircraft: 'A320', heading: '185°', speed: '398 kt', distance: '12.4 nm', status: 'BAF' },
    { callsign: 'TRN-02', altitude: '8,700 ft', aircraft: 'A330', heading: '143°', speed: '310 kt', distance: '8.1 nm', status: 'Training' },
    { callsign: 'OPS-01', altitude: '7,300 ft', aircraft: 'E175', heading: '220°', speed: '270 kt', distance: '15.6 nm', status: 'OPS' },
  ];

  seededMessages.forEach((message) => chat.addMessage(message));
  seededAlerts.forEach((alert) => alerts.addAlert(alert));
  seededPilots.forEach((pilot) => pilots.registerPilot(pilot));
  seededOperations.forEach((mission) => operations.addMission(mission));
  network.setStatus({ connected: true, latency: 19, channels: ['#operations', '#training', '#intel', '#admin', '#general'] });

  settings.set('layout', { open: true, pinned: true, width: 400, section: 'Dashboard' });
  ui.render();

  const toolbar = document.querySelector('.geofs-ui-bottom');
  if (toolbar) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'boc-toolbar-button';
    button.title = 'BAF Operations Client';
    button.innerHTML = '🛡 BOC';
    button.addEventListener('click', () => ui.toggleSidebar());
    const target = toolbar.querySelectorAll('button,div').length ? toolbar.querySelectorAll('button,div')[toolbar.querySelectorAll('button,div').length - 1] : null;
    if (target && target.parentNode) {
      target.parentNode.insertBefore(button, target.nextSibling);
    } else {
      toolbar.appendChild(button);
    }
  } else {
    const fallback = document.createElement('div');
    fallback.className = 'boc-toolbar-fallback';
    fallback.innerHTML = '<button type="button" class="boc-toolbar-button" title="BAF Operations Client">🛡 BOC</button>';
    fallback.querySelector('button').addEventListener('click', () => ui.toggleSidebar());
    document.body.appendChild(fallback);
  }

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'b') {
      event.preventDefault();
      ui.toggleSidebar();
    }
  });

  ui.installDynamicFilters();
  ui.showToast('BOC v4.0 Ready', 'Belgian Tech Systems • BAF Operations Client');

  if (window.BOC && typeof window.BOC.onReady === 'function') {
    window.BOC.onReady(core);
  }
})();
