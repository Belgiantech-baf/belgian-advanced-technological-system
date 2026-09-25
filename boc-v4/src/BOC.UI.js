(function () {
  const BOC = window.BOC || {};

  class BOCUI {
    constructor({ core, storage, settings }) {
      this.core = core;
      this.storage = storage;
      this.settings = settings;
      this.sections = ['Dashboard', 'BAF Chat', 'Radar', 'Pilots', 'Operations', 'Alerts', 'Intel', 'Logging', 'Settings'];
      this.currentSection = 'Dashboard';
      this.isOpen = true;
      this.isPinned = true;
      this.width = 400;
      this.viewHost = document.getElementById('boc-views');
      this.navHost = document.getElementById('boc-nav');
      this.titleHost = document.getElementById('boc-window-title');
      this.layoutKey = 'BOC.v4.sidebar.state';
      this.loadState();
      this.bindActions();
    }

    bindActions() {
      const closeButton = document.getElementById('boc-close');
      const pinButton = document.getElementById('boc-pin');
      if (closeButton) closeButton.addEventListener('click', () => this.toggleSidebar());
      if (pinButton) pinButton.addEventListener('click', () => this.togglePin());
      document.querySelector('[data-action="compact-mode"]')?.addEventListener('change', () => document.body.classList.toggle('compact'));
    }

    loadState() {
      try {
        const saved = JSON.parse(localStorage.getItem(this.layoutKey) || '{}');
        if (saved.section) this.currentSection = saved.section;
        if (typeof saved.open === 'boolean') this.isOpen = saved.open;
        if (typeof saved.pinned === 'boolean') this.isPinned = saved.pinned;
        if (saved.width) this.width = saved.width;
      } catch (error) {
        // ignore storage failures and fall back to defaults
      }
    }

    saveState() {
      const state = { section: this.currentSection, open: this.isOpen, pinned: this.isPinned, width: this.width };
      localStorage.setItem(this.layoutKey, JSON.stringify(state));
      this.settings.set('layout', state);
    }

    setSection(section) {
      this.currentSection = section;
      this.saveState();
      this.render();
    }

    toggleSidebar() {
      this.isOpen = !this.isOpen;
      if (this.isOpen) {
        this.isPinned = true;
      }
      this.applySidebarState();
      this.saveState();
    }

    togglePin() {
      this.isPinned = !this.isPinned;
      this.isOpen = this.isPinned || this.isOpen;
      this.applySidebarState();
      this.saveState();
    }

    applySidebarState() {
      const shell = document.getElementById('boc-shell');
      if (!shell) return;
      shell.classList.toggle('boc-closed', !this.isOpen);
      shell.classList.toggle('boc-pinned', this.isPinned);
      shell.style.setProperty('--boc-width', `${this.width}px`);
      document.body.classList.toggle('boc-compact', !!document.body.dataset.compact);
    }

    installDynamicFilters() {
      const filterButtons = document.querySelectorAll('[data-filter]');
      filterButtons.forEach((button) => {
        button.addEventListener('click', () => {
          filterButtons.forEach((item) => item.classList.toggle('active', item === button));
        });
      });
    }

    showToast(title, text) {
      const toast = document.getElementById('boc-toast');
      if (!toast) return;
      toast.querySelector('.toast-title').textContent = title;
      toast.querySelector('.toast-text').textContent = text;
      toast.classList.add('show');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
    }

    renderNav() {
      this.navHost.innerHTML = this.sections.map((section) => `
        <button class="nav-item ${section === this.currentSection ? 'active' : ''}" data-section="${section}">
          ${section}
        </button>
      `).join('');
      this.navHost.querySelectorAll('[data-section]').forEach((button) => {
        button.addEventListener('click', () => this.setSection(button.dataset.section));
      });
    }

    renderDashboard() {
      const tiles = [
        { label: 'BAF Members Online', value: '42' },
        { label: 'Current Server', value: 'BATS West' },
        { label: 'Operations Status', value: 'Nominal' },
        { label: 'Unread Messages', value: '14' },
        { label: 'Active Alerts', value: '03' },
        { label: 'System Status', value: 'Ready' },
      ];

      return `
        <div class="column-stack">
          <div class="stat-grid two-up">
            ${tiles.map((tile) => `
              <div class="stat-card">
                <div class="stat-label">${tile.label}</div>
                <div class="stat-value">${tile.value}</div>
              </div>
            `).join('')}
          </div>

          <div class="split-grid">
            <div class="panel-card">
              <h3>Mission Feed</h3>
              <div class="list-stack">
                ${this.core.getOperations().slice(0, 3).map((mission) => `
                  <div class="list-row">
                    <div>
                      <strong>${mission.name}</strong>
                      <small>${mission.location}</small>
                    </div>
                    <span class="badge ${mission.status === 'Live' ? 'green' : 'blue'}">${mission.status}</span>
                  </div>
                `).join('')}
              </div>
            </div>

            <div class="panel-card">
              <h3>Recent Alerts</h3>
              <div class="list-stack">
                ${this.core.getAlerts().slice(0, 3).map((alert) => `
                  <div class="list-row">
                    <div>
                      <strong>${alert.type}</strong>
                      <small>${alert.text}</small>
                    </div>
                    <span class="badge ${alert.severity === 'red' ? 'red' : alert.severity === 'orange' ? 'orange' : 'green'}">${alert.state}</span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>
      `;
    }

    renderBAFChat() {
      const channels = ['#operations', '#training', '#intel', '#admin', '#general'];
      const messages = this.core.messages.slice(-6).reverse();
      return `
        <div class="chat-layout">
          <aside class="chat-side">
            <div class="section-mini">Channels</div>
            <div class="chip-list">
              ${channels.map((channel) => `<button class="chip active" data-filter="channel">${channel}</button>`).join('')}
            </div>
            <div class="section-mini">Members</div>
            <div class="member-list">
              <div class="member-row"><span>MARA</span><span class="dot online"></span></div>
              <div class="member-row"><span>KAI</span><span class="dot training"></span></div>
              <div class="member-row"><span>ORBIT</span><span class="dot ops"></span></div>
              <div class="member-row"><span>SABLE</span><span class="dot away"></span></div>
            </div>
          </aside>

          <section class="chat-main">
            <div class="chat-header">
              <div>
                <strong>BOC Communications Server</strong>
                <small>Private BAF environment</small>
              </div>
              <span class="badge green">Connected</span>
            </div>
            <div class="message-stream">
              ${messages.map((message) => `
                <div class="chat-message ${message.type}">
                  <div class="meta"><strong>${message.sender}</strong><span>${message.callsign}</span><time>${new Date(message.stamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></div>
                  <div class="message-text">${message.text}</div>
                </div>
              `).join('')}
            </div>
            <div class="composer">
              <input type="text" value="" placeholder="Message #operations" />
              <button type="button">Send</button>
            </div>
          </section>
        </div>
      `;
    }

    renderRadar() {
      const entries = [
        { callsign: 'BAF-14', altitude: '12,400 ft', aircraft: 'A320', heading: '185°', speed: '398 kt', distance: '12.4 nm', status: 'BAF' },
        { callsign: 'TRN-02', altitude: '8,700 ft', aircraft: 'A330', heading: '143°', speed: '310 kt', distance: '8.1 nm', status: 'Training' },
        { callsign: 'OPS-01', altitude: '7,300 ft', aircraft: 'E175', heading: '220°', speed: '270 kt', distance: '15.6 nm', status: 'OPS' },
      ];

      return `
        <div class="column-stack">
          <div class="radar-panel">
            <div class="radar-surface">
              <div class="radar-ring r1"></div>
              <div class="radar-ring r2"></div>
              <div class="radar-ring r3"></div>
              <span class="radar-blip b1"></span>
              <span class="radar-blip b2"></span>
              <span class="radar-blip b3"></span>
            </div>
          </div>

          <div class="panel-card">
            <div class="toolbar-inline">
              <input type="search" placeholder="Search callsign" />
              <button type="button" class="chip active">All</button>
              <button type="button" class="chip">BAF</button>
              <button type="button" class="chip">Training</button>
            </div>
            <table>
              <thead>
                <tr><th>Callsign</th><th>Altitude</th><th>Aircraft</th><th>Heading</th><th>Speed</th><th>Distance</th></tr>
              </thead>
              <tbody>
                ${entries.map((item) => `
                  <tr>
                    <td><strong>${item.callsign}</strong></td>
                    <td>${item.altitude}</td>
                    <td>${item.aircraft}</td>
                    <td>${item.heading}</td>
                    <td>${item.speed}</td>
                    <td>${item.distance}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      `;
    }

    renderPilots() {
      const pilots = this.core.getActivePilots();
      return `
        <div class="panel-card">
          <div class="toolbar-inline">
            <button type="button" class="chip active" data-filter="all">All</button>
            <button type="button" class="chip" data-filter="BAF">BAF</button>
            <button type="button" class="chip" data-filter="Training">Training</button>
            <button type="button" class="chip" data-filter="Operations">Operations</button>
          </div>
          <table>
            <thead>
              <tr><th>Username</th><th>Rank</th><th>Callsign</th><th>Status</th><th>Last Seen</th></tr>
            </thead>
            <tbody>
              ${pilots.map((pilot) => `
                <tr>
                  <td>${pilot.username}</td>
                  <td>${pilot.rank}</td>
                  <td>${pilot.callsign}</td>
                  <td><span class="badge ${pilot.group === 'Training' ? 'yellow' : pilot.group === 'Operations' ? 'orange' : 'green'}">${pilot.status}</span></td>
                  <td>${pilot.lastSeen}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      `;
    }

    renderOperations() {
      const operations = this.core.getOperations();
      return `
        <div class="panel-card">
          <div class="section-header">
            <h2>Operations Center</h2>
            <span class="badge blue">Mission Board</span>
          </div>
          <div class="list-stack">
            ${operations.map((mission) => `
              <div class="list-row board-row">
                <div>
                  <strong>${mission.name}</strong>
                  <small>${mission.type} • ${mission.location}</small>
                </div>
                <div class="right-block">
                  <span class="badge ${mission.status === 'Live' ? 'green' : 'blue'}">${mission.status}</span>
                  <small>${mission.time}</small>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    renderAlerts() {
      const alerts = this.core.getAlerts();
      return `
        <div class="panel-card">
          <div class="section-header">
            <h2>Alert Center</h2>
            <span class="badge purple">Priority</span>
          </div>
          <div class="list-stack">
            ${alerts.map((alert) => `
              <div class="list-row">
                <div>
                  <strong>${alert.type}</strong>
                  <small>${alert.text}</small>
                </div>
                <span class="badge ${alert.severity === 'red' ? 'red' : alert.severity === 'orange' ? 'orange' : 'green'}">${alert.state}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    }

    renderIntel() {
      return `
        <div class="split-grid">
          <div class="panel-card">
            <h3>Activity Timeline</h3>
            <div class="timeline">
              <div><span>12:10Z</span><p>BAF presence confirmed in north corridor.</p></div>
              <div><span>12:25Z</span><p>Operation Atlas updated to active status.</p></div>
              <div><span>12:42Z</span><p>Training squadron deconflicted from live patrol.</p></div>
            </div>
          </div>
          <div class="panel-card">
            <h3>Chat Statistics</h3>
            <div class="stat-grid narrow">
              <div class="stat-card"><div class="stat-label">BAF Activity</div><div class="stat-value">64%</div></div>
              <div class="stat-card"><div class="stat-label">Mission Reports</div><div class="stat-value">07</div></div>
              <div class="stat-card"><div class="stat-label">Recent Events</div><div class="stat-value">12</div></div>
            </div>
          </div>
        </div>
      `;
    }

    renderLogging() {
      return `
        <div class="panel-card">
          <div class="section-header">
            <h2>Logging</h2>
            <span class="badge blue">Local only</span>
          </div>
          <div class="toolbar-inline">
            <button type="button" class="chip active">Export JSON</button>
            <button type="button" class="chip">Export CSV</button>
            <button type="button" class="chip">Clear Logs</button>
          </div>
          <table>
            <thead>
              <tr><th>Type</th><th>Source</th><th>Time</th><th>Status</th></tr>
            </thead>
            <tbody>
              <tr><td>Chat</td><td>#operations</td><td>12:11Z</td><td><span class="badge green">Stored</span></td></tr>
              <tr><td>Pilot</td><td>BAF-14</td><td>12:14Z</td><td><span class="badge green">Stored</span></td></tr>
              <tr><td>Alert</td><td>Admin Notice</td><td>12:22Z</td><td><span class="badge orange">Queued</span></td></tr>
            </tbody>
          </table>
        </div>
      `;
    }

    renderSettings() {
      return `
        <div class="split-grid">
          <div class="panel-card">
            <h3>Appearance</h3>
            <div class="toggle-list">
              <label><input type="checkbox" checked /> Dark Mode</label>
              <label><input type="checkbox" checked /> Compact Mode</label>
              <label><input type="checkbox" checked /> Sound Alerts</label>
              <label><input type="checkbox" checked /> Desktop Notifications</label>
            </div>
          </div>

          <div class="panel-card">
            <h3>Preferences</h3>
            <div class="toggle-list">
              <label><input type="checkbox" checked /> Radar Preferences</label>
              <label><input type="checkbox" checked /> Chat Preferences</label>
              <label><input type="checkbox" checked /> Auto-hide Sidebar</label>
              <label><input type="checkbox" checked /> Persistent Layout</label>
            </div>
          </div>
        </div>
      `;
    }

    renderSection(section) {
      const map = {
        Dashboard: this.renderDashboard(),
        'BAF Chat': this.renderBAFChat(),
        Radar: this.renderRadar(),
        Pilots: this.renderPilots(),
        Operations: this.renderOperations(),
        Alerts: this.renderAlerts(),
        Intel: this.renderIntel(),
        Logging: this.renderLogging(),
        Settings: this.renderSettings(),
      };
      return map[section] || '<div class="empty-state">Section unavailable.</div>';
    }

    render() {
      this.renderNav();
      this.titleHost.textContent = this.currentSection;
      this.viewHost.innerHTML = this.renderSection(this.currentSection);
      this.applySidebarState();
      this.installDynamicFilters();
    }
  }

  BOC.UI = BOCUI;
  window.BOC = BOC;
})();
