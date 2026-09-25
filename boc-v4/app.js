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
