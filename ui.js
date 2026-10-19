// UI Controller, Network Monitor, and Dossier Showcase for Y.O.L.O

class UIManager {
  constructor() {
    this.profile = this.loadProfile();
    this.isOnline = true;
    this.ping = 24;
    this.socket = null;
    this.initSocket();
    this.initNetworkMonitor();
    this.initEventListeners();
    this.updateProfileDisplay();
  }

  // Load persistent profile from localStorage (Requirement 7)
  loadProfile() {
    const saved = localStorage.getItem('yolo_player_profile');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved profile', e);
      }
    }
    // Default initial profile
    const randomId = 'usr_' + Math.floor(1000 + Math.random() * 9000);
    const initial = {
      id: randomId,
      username: 'Operative-' + randomId.slice(-4),
      avatar: '⚡',
      color: '#00f3ff',
      totalMatches: 0,
      wins: 0,
      losses: 0,
      kills: 0,
      deaths: 0,
      damageDealt: 0,
      winStreak: 0,
      bestWinStreak: 0,
      history: []
    };
    this.saveProfile(initial);
    return initial;
  }

  saveProfile(profileData) {
    this.profile = profileData || this.profile;
    localStorage.setItem('yolo_player_profile', JSON.stringify(this.profile));
    // Also sync to server database
    fetch('/api/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.profile)
    }).catch(() => {});
  }

  initSocket() {
    try {
      this.socket = io({
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 1000,
        timeout: 5000
      });
      this.socket.on('connect', () => {
        this.consecutiveFailures = 0;
        this.setOnlineStatus(true);
      });
      this.socket.on('disconnect', () => {
        // Transient socket disconnects must not flash the offline screen immediately.
        // Schedule a verification health check after a gentle delay.
        setTimeout(() => this.checkHealth(), 2000);
      });
    } catch (e) {
      console.warn('Socket.io error', e);
    }
  }

  // Requirement 3: Multi-Probe Internet Connection Verification
  initNetworkMonitor() {
    this.consecutiveFailures = 0;
    this.isChecking = false;

    // Browser online/offline event hooks
    window.addEventListener('online', () => {
      this.consecutiveFailures = 0;
      this.checkHealth(true);
    });
    window.addEventListener('offline', () => {
      this.consecutiveFailures = Math.max(this.consecutiveFailures, 2);
      this.checkHealth();
    });

    // Auto-recheck instantly when player refocuses browser tab
    window.addEventListener('focus', () => this.checkHealth(true));
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.checkHealth(true);
    });

    // Check periodically every 5 seconds
    setInterval(() => this.checkHealth(), 5000);
    this.checkHealth(true);
  }

  createTimeoutSignal(ms) {
    if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
      try {
        return AbortSignal.timeout(ms);
      } catch (e) {}
    }
    const ctrl = new AbortController();
    setTimeout(() => ctrl.abort(), ms);
    return ctrl.signal;
  }

  async checkHealth(immediate = false) {
    if (this.isChecking && !immediate) return;
    this.isChecking = true;

    const start = performance.now();
    let isReachable = false;
    let measuredPing = 24;

    // 1. Primary: Game Server API endpoint with strict 2.5s timeout
    try {
      const res = await fetch('/api/health?t=' + Date.now(), {
        cache: 'no-store',
        signal: this.createTimeoutSignal(2500)
      });

      if (res.ok) {
        isReachable = true;
        measuredPing = Math.max(8, Math.round(performance.now() - start));
      }
    } catch (err) {
      // Local check had a momentary timeout
    }

    // 2. Secondary: Public Internet probe (Google DNS / Cloudflare Trace)
    // Ensures genuine internet connectivity is recognized even if local endpoint is busy
    if (!isReachable) {
      try {
        const publicProbe = await Promise.any([
          fetch('https://dns.google/resolve?name=example.com', {
            method: 'GET',
            mode: 'cors',
            cache: 'no-store',
            signal: this.createTimeoutSignal(2000)
          }),
          fetch('https://1.1.1.1/cdn-cgi/trace', {
            method: 'GET',
            mode: 'no-cors',
            cache: 'no-store',
            signal: this.createTimeoutSignal(2000)
          })
        ]);
        if (publicProbe) {
          isReachable = true;
          measuredPing = Math.max(25, Math.round(performance.now() - start));
        }
      } catch (err2) {
        // Public probes failed or unreachable
      }
    }

    // 3. Fallback: Active Socket.io connection or browser online state
    if (!isReachable && navigator.onLine) {
      if (this.socket && this.socket.connected) {
        isReachable = true;
        measuredPing = 18;
      }
    }

    // Hysteresis / Debounce:
    // If ANY check succeeded OR browser is onLine and we haven't failed repeatedly:
    if (isReachable || (navigator.onLine && this.consecutiveFailures < 2)) {
      this.consecutiveFailures = 0;
      this.ping = measuredPing;
      this.setOnlineStatus(true);
    } else {
      this.consecutiveFailures++;
      // Only trigger the blocking modal after 3 consecutive failed cycles!
      if (this.consecutiveFailures >= 3) {
        this.setOnlineStatus(false);
      }
    }

    this.isChecking = false;
  }

  setOnlineStatus(online) {
    this.isOnline = online;
    const bar = document.getElementById('connection-bar');
    const text = document.getElementById('connection-text');
    const pingEl = document.getElementById('connection-ping');
    const blocker = document.getElementById('offline-blocker');

    if (online) {
      bar.className = 'connection-status online';
      text.innerText = 'ONLINE // COMBAT NETWORK CONNECTED';
      pingEl.innerText = `PING: ${this.ping}ms`;
      blocker.classList.add('hidden');
    } else {
      bar.className = 'connection-status offline';
      text.innerText = 'OFFLINE // NO INTERNET CONNECTION DETECTED';
      pingEl.innerText = 'DISCONNECTED';
      blocker.classList.remove('hidden');
    }
  }

  updateProfileDisplay() {
    document.getElementById('preview-avatar').innerText = this.profile.avatar || '⚡';
    document.getElementById('preview-username').innerText = this.profile.username || 'Operative';
    document.getElementById('preview-wins').innerText = `${this.profile.wins || 0} W`;

    const kd = (this.profile.deaths === 0) ? (this.profile.kills || 0) : ((this.profile.kills || 0) / this.profile.deaths).toFixed(2);
    document.getElementById('preview-kd').innerText = `${kd} K/D`;
    document.getElementById('preview-streak').innerText = `🔥 ${this.profile.winStreak || 0} STREAK`;

    document.getElementById('setting-username').value = this.profile.username || 'Operative';
  }

  initEventListeners() {
    // Retry connection button
    document.getElementById('btn-retry-connection').onclick = () => {
      const msgEl = document.getElementById('offline-reconnect-msg');
      if (msgEl) msgEl.innerText = 'TESTING COMBAT NETWORK...';
      this.consecutiveFailures = 0;
      this.checkHealth(true).then(() => {
        if (msgEl) {
          msgEl.innerText = this.isOnline ? 'ONLINE // CONNECTED!' : 'STILL OFFLINE // RETRYING...';
        }
      });
    };

    // Bypass / Dismiss button
    const bypassBtn = document.getElementById('btn-bypass-offline');
    if (bypassBtn) {
      bypassBtn.onclick = () => {
        document.getElementById('offline-blocker').classList.add('hidden');
        this.consecutiveFailures = 0;
        this.setOnlineStatus(true);
      };
    }

    // Sound toggle button
    document.getElementById('btn-toggle-sound').onclick = () => {
      const active = window.audioEngine.toggleMute();
      document.getElementById('btn-toggle-sound').innerHTML = active ? '<span class="btn-icon">🔊</span> AUDIO: ON' : '<span class="btn-icon">🔇</span> AUDIO: MUTED';
    };

    // Open Own Dossier
    document.getElementById('btn-open-my-profile').onclick = () => this.showDossier(this.profile.username, true);
    document.getElementById('btn-open-history').onclick = () => this.showDossier(this.profile.username, true);

    // Open Global Leaderboards
    document.getElementById('btn-open-leaderboard').onclick = () => this.showLeaderboard();

    // Open Armory / Customizer
    document.getElementById('btn-open-customizer').onclick = () => {
      document.getElementById('loadout-modal').classList.remove('hidden');
    };

    // Close buttons for modals
    document.getElementById('btn-close-dossier').onclick = () => document.getElementById('dossier-modal').classList.add('hidden');
    document.getElementById('btn-close-leaderboard').onclick = () => document.getElementById('leaderboard-modal').classList.add('hidden');
    document.getElementById('btn-close-loadout').onclick = () => document.getElementById('loadout-modal').classList.add('hidden');

    // Save Loadout
    document.getElementById('btn-save-loadout').onclick = () => {
      const newName = document.getElementById('setting-username').value.trim();
      if (newName) this.profile.username = newName;
      this.saveProfile();
      this.updateProfileDisplay();
      document.getElementById('loadout-modal').classList.add('hidden');
    };

    // Avatar Selection
    document.querySelectorAll('.avatar-option').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.avatar-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.profile.avatar = btn.dataset.avatar;
      };
    });

    // Color Selection
    document.querySelectorAll('.color-option').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.color-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.profile.color = btn.dataset.color;
      };
    });

    // Inspect Rival from Top HUD or Results Screen (Requirement 2)
    document.getElementById('btn-inspect-rival-hud').onclick = () => {
      if (window.gameInstance && window.gameInstance.currentOpponent) {
        this.showDossier(window.gameInstance.currentOpponent.username || 'Opponent');
      }
    };
    document.getElementById('btn-inspect-rival-result').onclick = () => {
      if (window.gameInstance && window.gameInstance.currentOpponent) {
        this.showDossier(window.gameInstance.currentOpponent.username || 'Opponent');
      }
    };

    // Keyboard shortcut TAB to inspect opponent dossier in game
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const dossierModal = document.getElementById('dossier-modal');
        if (dossierModal.classList.contains('hidden')) {
          if (window.gameInstance && window.gameInstance.currentOpponent) {
            this.showDossier(window.gameInstance.currentOpponent.username || 'Opponent');
          } else {
            this.showDossier(this.profile.username, true);
          }
        } else {
          dossierModal.classList.add('hidden');
        }
      }
    });

    // Mode segmented buttons
    document.querySelectorAll('.seg-btn').forEach(btn => {
      btn.onclick = (e) => {
        const parent = btn.parentElement;
        parent.querySelectorAll('.seg-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      };
    });

    // Multiplayer room tabs
    document.getElementById('tab-quick-play').onclick = () => {
      document.getElementById('tab-quick-play').classList.add('active');
      document.getElementById('tab-custom-room').classList.remove('active');
      document.getElementById('custom-room-section').classList.add('hidden');
      document.getElementById('btn-quick-play').innerText = 'FIND MATCH NOW';
    };

    document.getElementById('tab-custom-room').onclick = () => {
      document.getElementById('tab-quick-play').classList.remove('active');
      document.getElementById('tab-custom-room').classList.add('active');
      document.getElementById('custom-room-section').classList.remove('hidden');
      document.getElementById('btn-quick-play').innerText = 'ENTER ROOM';
    };
  }

  // Showcase Player or Opponent Match History (Requirement 2)
  async showDossier(usernameOrId, isSelf = false) {
    const modal = document.getElementById('dossier-modal');
    modal.classList.remove('hidden');

    document.getElementById('dossier-tag').innerText = isSelf ? 'YOUR COMBAT RECORD' : 'OPPONENT DOSSIER & SHOWCASE';
    document.getElementById('dossier-username').innerText = (usernameOrId || 'Operative').toUpperCase();

    // Fetch live profile and full match history
    let record = null;
    try {
      const res = await fetch(`/api/profile/${encodeURIComponent(usernameOrId)}`);
      if (res.ok) {
        record = await res.json();
      }
    } catch (e) {}

    // Fallback to local profile if self or generated record for bots
    if (!record) {
      if (isSelf || usernameOrId.toLowerCase() === this.profile.username.toLowerCase()) {
        record = this.profile;
      } else {
        // Simulated rival dossier for bots or new opponents
        record = {
          username: usernameOrId,
          totalMatches: 14,
          wins: 9,
          losses: 5,
          kills: 28,
          deaths: 12,
          damageDealt: 3420,
          winStreak: 3,
          bestWinStreak: 5,
          history: [
            { timestamp: new Date(Date.now() - 3600000).toISOString(), mode: '1v1 Duel', won: true, kills: 3, damage: 320, opponents: [{ username: this.profile.username }] },
            { timestamp: new Date(Date.now() - 7200000).toISOString(), mode: '10-Player Survival', won: false, kills: 2, damage: 240, opponents: [{ username: 'Shadow-9' }] },
            { timestamp: new Date(Date.now() - 14400000).toISOString(), mode: '1v1 Duel', won: true, kills: 4, damage: 410, opponents: [{ username: 'Apex-7' }] }
          ]
        };
      }
    }

    // Populate Dossier stats
    const totalMatches = record.totalMatches || 0;
    const wins = record.wins || 0;
    const losses = record.losses || 0;
    const winRate = totalMatches === 0 ? 0 : Math.round((wins / totalMatches) * 100);
    const kd = (record.deaths === 0 || !record.deaths) ? (record.kills || 0) : ((record.kills || 0) / record.deaths).toFixed(2);

    document.getElementById('dossier-winrate').innerText = `${winRate}%`;
    document.getElementById('dossier-matches').innerText = totalMatches;
    document.getElementById('dossier-wins').innerText = wins;
    document.getElementById('dossier-losses').innerText = losses;
    document.getElementById('dossier-kd').innerText = kd;
    document.getElementById('dossier-kills').innerText = record.kills || 0;
    document.getElementById('dossier-damage').innerText = (record.damageDealt || 0).toLocaleString();
    document.getElementById('dossier-streak').innerText = `${record.winStreak || 0} 🔥`;
    document.getElementById('dossier-best-streak').innerText = `${record.bestWinStreak || 0} 🔥`;

    // Populate Chronological Match History Table
    const tbody = document.getElementById('dossier-history-tbody');
    tbody.innerHTML = '';

    const history = record.history || [];
    document.getElementById('history-count').innerText = `${history.length} RECORDED`;

    if (history.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--text-dim); padding: 24px;">No completed matches recorded yet. Enter the arena to log combat data!</td></tr>`;
      return;
    }

    history.forEach(match => {
      const tr = document.createElement('tr');
      const dateStr = new Date(match.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
      const resultTag = match.won ? `<span class="table-tag win">VICTORY</span>` : `<span class="table-tag loss">DEFEAT</span>`;
      const oppList = (match.opponents || []).map(o => o.username).join(', ') || 'AI Combatant';

      tr.innerHTML = `
        <td>${dateStr}</td>
        <td><strong>${match.mode || 'Duel'}</strong></td>
        <td>${resultTag}</td>
        <td>${match.kills || 0}</td>
        <td>${(match.damage || 0).toLocaleString()}</td>
        <td style="color: var(--neon-cyan);">${oppList}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  async showLeaderboard() {
    const modal = document.getElementById('leaderboard-modal');
    modal.classList.remove('hidden');

    const tbody = document.getElementById('leaderboard-tbody');
    tbody.innerHTML = `<tr><td colspan="8" style="text-align: center;">Querying leaderboard matrix...</td></tr>`;

    try {
      const res = await fetch('/api/leaderboard');
      const list = await res.json();
      tbody.innerHTML = '';

      if (list.length === 0) {
        tbody.innerHTML = `<tr><td colspan="8" style="text-align: center;">No ranked operatives yet.</td></tr>`;
        return;
      }

      list.forEach((p, idx) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td><strong style="color: ${idx < 3 ? 'var(--neon-gold)' : 'inherit'}">#${idx + 1}</strong></td>
          <td><span style="color: ${p.color || '#00f3ff'}">${p.avatar || '⚡'} ${p.username}</span></td>
          <td class="neon-green">${p.wins}</td>
          <td>${p.winRate}%</td>
          <td class="neon-gold">${p.kdRatio}</td>
          <td>${p.kills}</td>
          <td>🔥 ${p.winStreak}</td>
          <td><button class="cyber-btn sm" onclick="window.uiManager.showDossier('${p.username}')">INSPECT</button></td>
        `;
        tbody.appendChild(tr);
      });
    } catch (e) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: var(--neon-pink);">Failed to load leaderboard.</td></tr>`;
    }
  }

  // Update HUD with live Health & Shield values (Requirement 1)
  updateHUD(myPlayer, rivalPlayer, matchTime, survivorsCount, stormShrinking) {
    if (!myPlayer) return;

    // 1. My Health and Shield
    const myHpPercent = Math.max(0, Math.min(100, (myPlayer.hp / myPlayer.maxHp) * 100));
    const myShieldPercent = Math.max(0, Math.min(100, (myPlayer.shield / myPlayer.maxShield) * 100));

    document.getElementById('hud-my-hp-fill').style.width = `${myHpPercent}%`;
    document.getElementById('hud-my-hp-text').innerText = `${Math.round(myPlayer.hp)} / ${myPlayer.maxHp} HP`;

    document.getElementById('hud-my-shield-fill').style.width = `${myShieldPercent}%`;
    document.getElementById('hud-my-shield-text').innerText = `${Math.round(myPlayer.shield)} / ${myPlayer.maxShield} SHIELD`;

    // 2. Opponent Health and Shield (Requirement 1)
    const rivalCard = document.getElementById('rival-hud-card');
    if (rivalPlayer && rivalPlayer.alive) {
      rivalCard.style.opacity = '1';
      document.getElementById('hud-rival-name').innerText = rivalPlayer.username.toUpperCase();
      document.getElementById('hud-rival-avatar').innerText = rivalPlayer.avatar || '💀';

      const rivalHpPercent = Math.max(0, Math.min(100, (rivalPlayer.hp / rivalPlayer.maxHp) * 100));
      const rivalShieldPercent = Math.max(0, Math.min(100, (rivalPlayer.shield / rivalPlayer.maxShield) * 100));

      document.getElementById('hud-rival-hp-fill').style.width = `${rivalHpPercent}%`;
      document.getElementById('hud-rival-hp-text').innerText = `${Math.round(rivalPlayer.hp)} / ${rivalPlayer.maxHp} HP`;

      document.getElementById('hud-rival-shield-fill').style.width = `${rivalShieldPercent}%`;
      document.getElementById('hud-rival-shield-text').innerText = `${Math.round(rivalPlayer.shield)} / ${rivalPlayer.maxShield} SHIELD`;
    } else {
      rivalCard.style.opacity = '0.3';
      document.getElementById('hud-rival-hp-fill').style.width = '0%';
      document.getElementById('hud-rival-shield-fill').style.width = '0%';
      document.getElementById('hud-rival-hp-text').innerText = '0 HP';
      document.getElementById('hud-rival-shield-text').innerText = '0 SHIELD';
    }

    // 3. Match center timer and survivors
    const mins = Math.floor(matchTime / 60).toString().padStart(2, '0');
    const secs = Math.floor(matchTime % 60).toString().padStart(2, '0');
    document.getElementById('hud-timer').innerText = `${mins}:${secs}`;
    document.getElementById('hud-survivor-num').innerText = survivorsCount;

    const stormEl = document.getElementById('hud-storm-alert');
    if (stormShrinking) {
      stormEl.classList.remove('hidden');
    } else {
      stormEl.classList.add('hidden');
    }

    // 4. Power-up status tray and badges (Requirement 4)
    this.updateBuffHUD(myPlayer);
  }

  updateBuffHUD(player) {
    const buffsEl = document.getElementById('hud-my-buffs');
    const trayEl = document.getElementById('powerup-tray');
    buffsEl.innerHTML = '';
    trayEl.innerHTML = '';

    const buffs = player.buffs || {};

    if (buffs.damageBoost > 0) {
      buffsEl.innerHTML += `<span class="buff-badge-mini buff-dmg">🔥 2.5x DMG (${Math.ceil(buffs.damageBoost)}s)</span>`;
      trayEl.innerHTML += `<div class="tray-buff-card dmg"><span>🔥</span> 2.5x QUAD DAMAGE [${Math.ceil(buffs.damageBoost)}s]</div>`;
    }

    if (player.hasDoubleShield || buffs.shieldActive) {
      buffsEl.innerHTML += `<span class="buff-badge-mini buff-shield">🛡️ 2x SHIELD</span>`;
      trayEl.innerHTML += `<div class="tray-buff-card"><span>🛡️</span> 2x ENERGY BARRIER</div>`;
    }

    if (buffs.cloneActive > 0) {
      buffsEl.innerHTML += `<span class="buff-badge-mini buff-clone">🤖 CLONE (${Math.ceil(buffs.cloneActive)}s)</span>`;
      trayEl.innerHTML += `<div class="tray-buff-card"><span>🤖</span> CLONE DRONE ENGAGED [${Math.ceil(buffs.cloneActive)}s]</div>`;
    }

    // Time slow indicator and screen warp effect (Requirement 4)
    const warpOverlay = document.getElementById('chrono-warp-overlay');
    const warpText = document.getElementById('chrono-warp-text');

    if (buffs.timeSlowed > 0) {
      warpOverlay.classList.remove('hidden');
      warpText.innerText = `TEMPORAL WARP INFLICTED // YOU ARE SLOWED (${buffs.timeSlowed.toFixed(1)}s)`;
      buffsEl.innerHTML += `<span class="buff-badge-mini buff-slow">⏳ SLOWED (${buffs.timeSlowed.toFixed(1)}s)</span>`;
      trayEl.innerHTML += `<div class="tray-buff-card slow"><span>⏳</span> TIME SLOWED [${buffs.timeSlowed.toFixed(1)}s]</div>`;
    } else {
      warpOverlay.classList.add('hidden');
    }
  }
}

window.uiManager = new UIManager();
