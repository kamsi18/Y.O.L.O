// Y.O.L.O (You Only Live Once) - Core Game Engine & Multiplayer Client
// Fully integrates health bars, opponent showcase, online netcode, powerups, obstacles & stealth cover.

class YoloGame {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.minimapCanvas = document.getElementById('minimap-canvas');
    this.minimapCtx = this.minimapCanvas.getContext('2d');

    this.mode = '1v1'; // '1v1' or 'survival'
    this.isMultiplayer = false;
    this.isHost = false;
    this.roomId = null;

    // Simulation Entities
    this.players = [];
    this.myPlayer = null;
    this.currentOpponent = null;
    this.clones = [];
    this.bullets = [];
    this.powerups = [];
    this.obstacles = [];
    this.stealthZones = [];
    this.storm = null;

    // Camera & Screen Shake
    this.camera = { x: 0, y: 0, width: 1200, height: 800 };
    this.screenShake = 0;

    // Map bounds
    this.mapWidth = 1600;
    this.mapHeight = 1200;

    // Local Bot Controllers (for Solo vs Computer)
    this.bots = [];
    this.botDifficulty = 'veteran';

    // Inputs
    this.keys = { up: false, down: false, left: false, right: false, fire: false };
    this.mouse = { x: 0, y: 0, worldX: 0, worldY: 0, down: false };

    // State
    this.gameState = 'menu'; // 'menu', 'lobby', 'playing', 'gameover'
    this.matchStartTime = 0;
    this.matchDuration = 0;
    this.lastTime = performance.now();

    this.initCanvasResize();
    this.initInputs();
    this.initLobbyEvents();

    // Start Animation Loop
    requestAnimationFrame((t) => this.loop(t));
  }

  initCanvasResize() {
    const resize = () => {
      this.canvas.width = window.innerWidth;
      this.canvas.height = window.innerHeight - 28; // minus top connection bar
      this.camera.width = this.canvas.width;
      this.camera.height = this.canvas.height;
    };
    window.addEventListener('resize', resize);
    resize();
  }

  initInputs() {
    window.addEventListener('keydown', (e) => {
      if (document.activeElement.tagName === 'INPUT') return;
      if (e.code === 'KeyW' || e.code === 'ArrowUp') this.keys.up = true;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') this.keys.down = true;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys.left = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = true;
      if (e.code === 'Space') this.keys.fire = true;
      if (e.code === 'KeyM') {
        const unmuted = window.audioEngine.toggleMute();
        document.getElementById('btn-toggle-sound').innerHTML = unmuted ? '<span class="btn-icon">🔊</span> AUDIO: ON' : '<span class="btn-icon">🔇</span> AUDIO: MUTED';
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') this.keys.up = false;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') this.keys.down = false;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') this.keys.left = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') this.keys.right = false;
      if (e.code === 'Space') this.keys.fire = false;
    });

    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - rect.left;
      this.mouse.y = e.clientY - rect.top;
      this.mouse.worldX = this.mouse.x + this.camera.x;
      this.mouse.worldY = this.mouse.y + this.camera.y;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouse.down = true;
        this.keys.fire = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.mouse.down = false;
        this.keys.fire = false;
      }
    });
  }

  // ---------------- LOBBY & MODE EVENT HOOKS ----------------
  initLobbyEvents() {
    // 1. Solo vs Bot Start
    document.getElementById('btn-start-bot-game').onclick = () => {
      const activeSeg = document.querySelector('#card-vs-bot .seg-btn.active');
      this.mode = activeSeg ? activeSeg.dataset.botMode : '1v1';
      this.botDifficulty = document.getElementById('bot-difficulty-select').value || 'veteran';
      this.startSoloMatch();
    };

    // 2. Multiplayer Quick Play or Join
    document.getElementById('btn-quick-play').onclick = () => {
      const isCustomTab = document.getElementById('tab-custom-room').classList.contains('active');
      const activeSeg = document.querySelector('#card-vs-player .seg-btn.active');
      this.mode = activeSeg ? activeSeg.dataset.onlineMode : '1v1';

      if (isCustomTab) {
        const code = document.getElementById('input-room-code').value.trim();
        if (code) {
          this.joinOnlineRoom(code);
        } else {
          this.createOnlineRoom();
        }
      } else {
        this.createOnlineRoom();
      }
    };

    document.getElementById('btn-create-room').onclick = () => this.createOnlineRoom();
    document.getElementById('btn-join-room').onclick = () => {
      const code = document.getElementById('input-room-code').value.trim();
      if (code) this.joinOnlineRoom(code);
    };

    // Lobby actions
    document.getElementById('btn-leave-lobby').onclick = () => this.returnToMenu();
    document.getElementById('btn-copy-room-code').onclick = () => {
      if (this.roomId) {
        navigator.clipboard.writeText(this.roomId);
        alert(`Room Code copied: ${this.roomId}`);
      }
    };
    document.getElementById('btn-add-bot').onclick = () => {
      if (window.uiManager.socket && this.isHost) {
        window.uiManager.socket.emit('add-bot');
      }
    };
    document.getElementById('btn-start-lobby-match').onclick = () => {
      if (window.uiManager.socket && this.isHost) {
        window.uiManager.socket.emit('start-room-match');
      }
    };

    // Chat comms
    document.getElementById('btn-send-chat').onclick = () => this.sendChatMessage();
    document.getElementById('input-chat-msg').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.sendChatMessage();
    });
    document.querySelectorAll('.taunt-chip').forEach(btn => {
      btn.onclick = () => {
        if (window.uiManager.socket) {
          window.uiManager.socket.emit('send-chat', btn.dataset.taunt);
        }
      };
    });

    // Match Result Modal buttons
    document.getElementById('btn-play-again').onclick = () => {
      document.getElementById('result-modal').classList.add('hidden');
      if (this.isMultiplayer) {
        this.returnToMenu();
      } else {
        this.startSoloMatch();
      }
    };
    document.getElementById('btn-return-menu').onclick = () => {
      document.getElementById('result-modal').classList.add('hidden');
      this.returnToMenu();
    };

    // Socket listeners for online multiplayer
    const socket = window.uiManager.socket;
    if (socket) {
      socket.on('room-joined', (data) => {
        this.isMultiplayer = true;
        this.roomId = data.roomId;
        this.isHost = data.isHost;
        this.mode = data.roomSnapshot.mode;

        document.getElementById('menu-screen').classList.add('hidden');
        document.getElementById('lobby-screen').classList.remove('hidden');
        document.getElementById('lobby-room-title').innerText = `ARENA LOBBY: ${this.roomId}`;
        document.getElementById('lobby-mode-tag').innerText = this.mode === '1v1' ? '1v1 DUEL' : '10-PLAYER SURVIVAL FFA';

        const hostControls = document.getElementById('host-controls');
        if (this.isHost) {
          hostControls.classList.remove('hidden');
        } else {
          hostControls.classList.add('hidden');
        }
      });

      socket.on('room-players-updated', (data) => {
        this.renderLobbyRoster(data.players);
      });

      socket.on('chat-message', (data) => {
        const log = document.getElementById('lobby-chat-log');
        const div = document.createElement('div');
        div.className = 'chat-msg';
        div.innerHTML = `<span class="sender" style="color: ${data.color || '#00f3ff'}">${data.sender}:</span> <span>${data.text}</span>`;
        log.appendChild(div);
        log.scrollTop = log.scrollHeight;
      });

      socket.on('match-started', (data) => {
        document.getElementById('lobby-screen').classList.add('hidden');
        document.getElementById('game-screen').classList.remove('hidden');
        this.gameState = 'playing';
        this.obstacles = data.mapData.obstacles;
        this.stealthZones = data.mapData.stealthZones;
        this.mapWidth = data.mapData.width;
        this.mapHeight = data.mapData.height;
      });

      socket.on('game-update', (snapshot) => {
        if (this.isMultiplayer && this.gameState === 'playing') {
          this.applyServerSnapshot(snapshot);
        }
      });

      socket.on('match-ended', (data) => {
        this.handleMatchGameOver(data.winner, data.participants, data.duration);
      });

      socket.on('room-error', (msg) => {
        alert(msg);
      });
    }
  }

  sendChatMessage() {
    const input = document.getElementById('input-chat-msg');
    const txt = input.value.trim();
    if (txt && window.uiManager.socket) {
      window.uiManager.socket.emit('send-chat', txt);
      input.value = '';
    }
  }

  renderLobbyRoster(players) {
    const container = document.getElementById('lobby-players-list');
    container.innerHTML = '';
    document.getElementById('lobby-count').innerText = players.length;
    document.getElementById('lobby-max').innerText = this.mode === '1v1' ? '2' : '10';

    players.forEach(p => {
      const div = document.createElement('div');
      div.className = 'combatant-entry';
      div.title = 'Click to inspect Career History & Dossier';
      div.onclick = () => window.uiManager.showDossier(p.username);

      div.innerHTML = `
        <div class="combatant-entry-left">
          <div class="entry-avatar" style="color: ${p.color}">${p.avatar || '⚡'}</div>
          <div>
            <span class="entry-name" style="color: ${p.color}">${p.username}</span>
            ${p.isHost ? '<span class="host-badge">HOST</span>' : ''}
            ${p.isBot ? '<span class="bot-badge">AI BOT</span>' : ''}
          </div>
        </div>
        <div class="combatant-entry-right">
          <span class="inspect-pill">📋 DOSSIER</span>
        </div>
      `;
      container.appendChild(div);
    });
  }

  createOnlineRoom() {
    if (!window.uiManager.isOnline) {
      alert('Active internet connection required to create rooms.');
      return;
    }
    const socket = window.uiManager.socket;
    if (socket) {
      const code = 'YOLO-' + Math.floor(1000 + Math.random() * 9000);
      socket.emit('create-room', {
        roomId: code,
        mode: this.mode,
        profile: window.uiManager.profile
      });
    }
  }

  joinOnlineRoom(code) {
    if (!window.uiManager.isOnline) {
      alert('Active internet connection required to join rooms.');
      return;
    }
    const socket = window.uiManager.socket;
    if (socket) {
      socket.emit('join-room', {
        roomId: code,
        profile: window.uiManager.profile
      });
    }
  }

  returnToMenu() {
    this.gameState = 'menu';
    this.isMultiplayer = false;
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.add('hidden');
    document.getElementById('result-modal').classList.add('hidden');
    document.getElementById('menu-screen').classList.remove('hidden');
    window.uiManager.updateProfileDisplay();
  }

  // ---------------- SOLO VS COMPUTER ENGINE (Requirement 9 & 10) ----------------
  startSoloMatch() {
    this.isMultiplayer = false;
    this.gameState = 'playing';
    this.matchStartTime = performance.now();
    this.matchDuration = 0;

    document.getElementById('menu-screen').classList.add('hidden');
    document.getElementById('game-screen').classList.remove('hidden');

    // Setup map based on mode
    if (this.mode === '1v1') {
      this.mapWidth = 1600;
      this.mapHeight = 1200;
      const map = this.generateMap1v1();
      this.obstacles = map.obstacles;
      this.stealthZones = map.stealthZones;
      this.powerups = map.powerups;
      this.storm = { active: false };
      document.getElementById('survival-roster').classList.add('hidden');
    } else {
      // 10-Player Survival Battle Royale
      this.mapWidth = 2400;
      this.mapHeight = 2400;
      const map = this.generateMapSurvival();
      this.obstacles = map.obstacles;
      this.stealthZones = map.stealthZones;
      this.powerups = map.powerups;
      this.storm = {
        active: true,
        x: 1200,
        y: 1200,
        radius: 1700,
        targetRadius: 180,
        shrinkRate: 14,
        damagePerSec: 15
      };
      document.getElementById('survival-roster').classList.remove('hidden');
    }

    // Spawn Local Player
    const userProfile = window.uiManager.profile;
    this.myPlayer = {
      id: userProfile.id || 'player_user',
      username: userProfile.username || 'Operative',
      avatar: userProfile.avatar || '⚡',
      color: userProfile.color || '#00f3ff',
      alive: true,
      x: this.mode === '1v1' ? 250 : 1200,
      y: this.mode === '1v1' ? 600 : 1850,
      radius: 24,
      angle: 0,
      vx: 0,
      vy: 0,
      speed: 270,
      maxHp: 100,
      hp: 100,
      maxShield: 100,
      shield: 100,
      hasDoubleShield: false,
      kills: 0,
      damageDealt: 0,
      powerupsCollected: 0,
      placement: 0,
      buffs: { damageBoost: 0, shieldActive: false, timeSlowed: 0, cloneActive: 0 },
      lastFireTime: 0,
      fireRate: 200,
      stealth: false,
      revealedTimer: 0
    };

    // Spawn AI Bots (1 for 1v1, 9 for Survival)
    this.players = [this.myPlayer];
    this.bots = [];
    this.clones = [];
    this.bullets = [];

    const botCount = this.mode === '1v1' ? 1 : 9;
    const botNames = ['Shadow-9', 'Vortex-X', 'Cyber-Reaper', 'Ghost-7', 'Titan-V', 'Nyx-Cyber', 'Apex-Overlord', 'Blitzkrieg', 'Sentinel-Zero'];
    const botColors = ['#ff0055', '#ffb703', '#9d4edd', '#00ff88', '#ff3366', '#3a86ff', '#e0aaff', '#f72585', '#4cc9f0'];

    for (let i = 0; i < botCount; i++) {
      let bx, by;
      if (this.mode === '1v1') {
        bx = 1350;
        by = 600;
      } else {
        const angle = ((i + 1) / 10) * Math.PI * 2;
        bx = 1200 + Math.cos(angle) * 850;
        by = 1200 + Math.sin(angle) * 850;
      }

      const botData = {
        id: 'bot_' + i,
        username: botNames[i % botNames.length],
        avatar: '🤖',
        color: botColors[i % botColors.length],
        isBot: true,
        alive: true,
        x: bx,
        y: by,
        radius: 24,
        angle: Math.PI,
        vx: 0,
        vy: 0,
        speed: 250,
        maxHp: 100,
        hp: 100,
        maxShield: 100,
        shield: 100,
        hasDoubleShield: false,
        kills: 0,
        damageDealt: 0,
        powerupsCollected: 0,
        placement: 0,
        buffs: { damageBoost: 0, shieldActive: false, timeSlowed: 0, cloneActive: 0 },
        lastFireTime: 0,
        fireRate: 240,
        stealth: false,
        revealedTimer: 0
      };

      this.players.push(botData);
      this.bots.push(new window.BotAI(botData, this.botDifficulty));
    }

    // Set initial primary opponent
    this.currentOpponent = this.players[1];
    document.getElementById('hud-match-mode').innerText = this.mode === '1v1' ? '1v1 DUEL VS AI' : '10-PLAYER SURVIVAL BATTLE ROYALE';
  }

  generateMap1v1() {
    const obstacles = [
      { id: 'b1', type: 'wall', x: 740, y: 500, width: 120, height: 200, hp: Infinity },
      { id: 'b2', type: 'wall', x: 350, y: 350, width: 60, height: 220, hp: Infinity },
      { id: 'b3', type: 'wall', x: 350, y: 630, width: 60, height: 220, hp: Infinity },
      { id: 'b4', type: 'wall', x: 1190, y: 350, width: 60, height: 220, hp: Infinity },
      { id: 'b5', type: 'wall', x: 1190, y: 630, width: 60, height: 220, hp: Infinity },
      { id: 'c1', type: 'crate', x: 550, y: 550, width: 70, height: 70, hp: 80, maxHp: 80 },
      { id: 'c2', type: 'crate', x: 980, y: 580, width: 70, height: 70, hp: 80, maxHp: 80 },
      { id: 'c3', type: 'crate', x: 765, y: 300, width: 70, height: 70, hp: 80, maxHp: 80 },
      { id: 'c4', type: 'crate', x: 765, y: 830, width: 70, height: 70, hp: 80, maxHp: 80 },
      { id: 'p1', type: 'pillar', x: 500, y: 200, width: 50, height: 50, hp: Infinity },
      { id: 'p2', type: 'pillar', x: 1050, y: 200, width: 50, height: 50, hp: Infinity },
      { id: 'p3', type: 'pillar', x: 500, y: 950, width: 50, height: 50, hp: Infinity },
      { id: 'p4', type: 'pillar', x: 1050, y: 950, width: 50, height: 50, hp: Infinity }
    ];

    const stealthZones = [
      { id: 's1', x: 200, y: 500, width: 120, height: 200 },
      { id: 's2', x: 1280, y: 500, width: 120, height: 200 },
      { id: 's3', x: 700, y: 120, width: 200, height: 120 },
      { id: 's4', x: 700, y: 960, width: 200, height: 120 }
    ];

    const powerups = [
      { id: 'pup_1', x: 800, y: 220, type: 'slow', subType: '7s', duration: 7, label: 'Chrono Slow (7s)', radius: 22 },
      { id: 'pup_2', x: 800, y: 980, type: 'damage', duration: 12, label: '2.5x Quad Damage', radius: 22 },
      { id: 'pup_3', x: 250, y: 600, type: 'shield', duration: 20, label: '2x Energy Barrier', radius: 22 },
      { id: 'pup_4', x: 1350, y: 600, type: 'clone', duration: 15, label: 'Clone Drone', radius: 22 },
      { id: 'pup_5', x: 800, y: 600, type: 'slow', subType: '10s', duration: 10, label: 'Chrono Slow (10s)', radius: 22 }
    ];

    return { obstacles, stealthZones, powerups };
  }

  generateMapSurvival() {
    const obstacles = [];
    const stealthZones = [];
    const powerups = [];

    // Fortress
    obstacles.push({ id: 'cf_n', type: 'wall', x: 1050, y: 1000, width: 300, height: 40, hp: Infinity });
    obstacles.push({ id: 'cf_s', type: 'wall', x: 1050, y: 1360, width: 300, height: 40, hp: Infinity });
    obstacles.push({ id: 'cf_w', type: 'wall', x: 1000, y: 1050, width: 40, height: 300, hp: Infinity });
    obstacles.push({ id: 'cf_e', type: 'wall', x: 1360, y: 1050, width: 40, height: 300, hp: Infinity });
    obstacles.push({ id: 'cf_c1', type: 'crate', x: 1160, y: 1160, width: 80, height: 80, hp: 100, maxHp: 100 });

    const sectors = [{ cx: 600, cy: 600 }, { cx: 1800, cy: 600 }, { cx: 600, cy: 1800 }, { cx: 1800, cy: 1800 }];
    sectors.forEach((sec, idx) => {
      obstacles.push({ id: `sec_w1_${idx}`, type: 'wall', x: sec.cx - 120, y: sec.cy - 50, width: 240, height: 40, hp: Infinity });
      obstacles.push({ id: `sec_w2_${idx}`, type: 'wall', x: sec.cx - 50, y: sec.cy - 120, width: 40, height: 240, hp: Infinity });
      obstacles.push({ id: `sec_c1_${idx}`, type: 'crate', x: sec.cx - 160, y: sec.cy + 120, width: 70, height: 70, hp: 80, maxHp: 80 });
      stealthZones.push({ id: `sz_${idx}`, x: sec.cx + 80, y: sec.cy + 80, width: 160, height: 160 });
      powerups.push({ id: `ps_${idx}_1`, x: sec.cx - 140, y: sec.cy - 140, type: idx % 2 === 0 ? 'damage' : 'shield', duration: 12, label: idx % 2 === 0 ? '2.5x Quad Damage' : '2x Shield', radius: 22 });
      powerups.push({ id: `ps_${idx}_2`, x: sec.cx + 140, y: sec.cy + 140, type: idx % 2 === 0 ? 'clone' : 'slow', subType: '7s', duration: 7, label: idx % 2 === 0 ? 'Clone' : 'Chrono Slow (7s)', radius: 22 });
    });

    // Mid fog zones
    stealthZones.push({ id: 'sz_m1', x: 1100, y: 400, width: 200, height: 150 });
    stealthZones.push({ id: 'sz_m2', x: 1100, y: 1850, width: 200, height: 150 });
    powerups.push({ id: 'ps_center', x: 1200, y: 1200, type: 'slow', subType: '10s', duration: 10, label: 'Chrono Slow (10s)', radius: 22 });

    return { obstacles, stealthZones, powerups };
  }

  // ---------------- GAME TICK LOOP ----------------
  loop(currentTime) {
    const dt = Math.min((currentTime - this.lastTime) / 1000, 0.1);
    this.lastTime = currentTime;

    if (this.gameState === 'playing') {
      this.update(dt);
      this.render();
    }

    requestAnimationFrame((t) => this.loop(t));
  }

  update(dt) {
    this.matchDuration += dt;

    if (this.isMultiplayer) {
      // Send inputs to server
      const socket = window.uiManager.socket;
      if (socket) {
        socket.emit('player-input', {
          up: this.keys.up,
          down: this.keys.down,
          left: this.keys.left,
          right: this.keys.right,
          fire: this.keys.fire,
          angle: this.myPlayer ? Math.atan2(this.mouse.worldY - this.myPlayer.y, this.mouse.worldX - this.myPlayer.x) : 0
        });
      }
      return;
    }

    // ---------------- LOCAL SIMULATION (SOLO MODE) ----------------
    // 1. Shrink storm
    if (this.storm && this.storm.active && this.storm.radius > this.storm.targetRadius) {
      this.storm.radius = Math.max(this.storm.targetRadius, this.storm.radius - this.storm.shrinkRate * dt);
    }

    // 2. Update Local Player
    if (this.myPlayer && this.myPlayer.alive) {
      // Aim angle
      this.myPlayer.angle = Math.atan2(this.mouse.worldY - this.myPlayer.y, this.mouse.worldX - this.myPlayer.x);

      // Movement
      const slowFactor = this.myPlayer.buffs.timeSlowed > 0 ? 0.4 : 1.0;
      let dx = 0;
      let dy = 0;
      if (this.keys.up) dy -= 1;
      if (this.keys.down) dy += 1;
      if (this.keys.left) dx -= 1;
      if (this.keys.right) dx += 1;

      if (dx !== 0 && dy !== 0) {
        dx *= 0.7071;
        dy *= 0.7071;
      }

      this.myPlayer.vx = dx * this.myPlayer.speed * slowFactor;
      this.myPlayer.vy = dy * this.myPlayer.speed * slowFactor;

      // Firing
      if (this.keys.fire) {
        this.fireBullet(this.myPlayer);
      }

      // Update Buffs
      this.updateBuffTimers(this.myPlayer, dt);
      this.moveEntityWithObstacleCollisions(this.myPlayer, dt);

      // Storm damage
      if (this.storm && this.storm.active) {
        const d = Math.hypot(this.myPlayer.x - this.storm.x, this.myPlayer.y - this.storm.y);
        if (d > this.storm.radius) {
          this.damagePlayer(this.myPlayer, this.storm.damagePerSec * dt);
        }
      }

      // Stealth check
      this.checkStealthZone(this.myPlayer);

      // Power-up check
      this.checkPowerupPickup(this.myPlayer);
    }

    // 3. Update Bots
    this.bots.forEach(botAI => {
      botAI.update(dt, this.players, this.powerups, this.obstacles, this.stealthZones, this.bullets, { width: this.mapWidth, height: this.mapHeight });
      const b = botAI.bot;
      if (!b.alive) return;

      this.updateBuffTimers(b, dt);
      this.moveEntityWithObstacleCollisions(b, dt);

      if (b.wantsToFire) {
        this.fireBullet(b);
      }

      // Storm damage
      if (this.storm && this.storm.active) {
        const d = Math.hypot(b.x - this.storm.x, b.y - this.storm.y);
        if (d > this.storm.radius) {
          this.damagePlayer(b, this.storm.damagePerSec * dt);
        }
      }

      this.checkStealthZone(b);
      this.checkPowerupPickup(b);
    });

    // 4. Update Clones
    for (let i = this.clones.length - 1; i >= 0; i--) {
      const clone = this.clones[i];
      clone.lifeTimer -= dt;
      if (clone.lifeTimer <= 0 || clone.hp <= 0) {
        this.clones.splice(i, 1);
        continue;
      }

      const owner = this.players.find(p => p.id === clone.ownerId && p.alive);
      if (!owner) {
        this.clones.splice(i, 1);
        continue;
      }

      // Follow owner
      const angleToOwner = Math.atan2(owner.y - clone.y, owner.x - clone.x);
      const distToOwner = Math.hypot(owner.x - clone.x, owner.y - clone.y);
      if (distToOwner > 70) {
        clone.x += Math.cos(angleToOwner) * 220 * dt;
        clone.y += Math.sin(angleToOwner) * 220 * dt;
      }

      // Seek enemy
      let nearestEnemy = null;
      let minDist = 700;
      for (const t of this.players) {
        if (t.id !== clone.ownerId && t.alive && !t.stealth) {
          const d = Math.hypot(t.x - clone.x, t.y - clone.y);
          if (d < minDist) {
            minDist = d;
            nearestEnemy = t;
          }
        }
      }

      if (nearestEnemy) {
        clone.angle = Math.atan2(nearestEnemy.y - clone.y, nearestEnemy.x - clone.x);
        const now = performance.now();
        if (now - clone.lastFireTime > clone.fireRate) {
          clone.lastFireTime = now;
          this.fireCloneBullet(clone, owner);
        }
      }
    }

    // 5. Update Bullets
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.traveled += Math.hypot(b.vx * dt, b.vy * dt);

      if (b.traveled >= 1200 || b.x < 0 || b.x > this.mapWidth || b.y < 0 || b.y > this.mapHeight) {
        this.bullets.splice(i, 1);
        continue;
      }

      // Check obstacle hit
      let hitObs = false;
      for (const obs of this.obstacles) {
        if (this.circleHitsRect(b.x, b.y, b.radius, obs.x, obs.y, obs.width, obs.height)) {
          hitObs = true;
          window.particleSystem.createSparks(b.x, b.y, '#ffb703', 8);
          if (obs.type === 'crate') {
            obs.hp -= b.damage;
            if (obs.hp <= 0) {
              window.particleSystem.createExplosion(obs.x + obs.width / 2, obs.y + obs.height / 2, '#ffb703', 25);
              window.audioEngine.playExplosion();
              this.obstacles = this.obstacles.filter(o => o.id !== obs.id);
            }
          }
          break;
        }
      }
      if (hitObs) {
        this.bullets.splice(i, 1);
        continue;
      }

      // Check player hits
      let hitP = false;
      for (const target of this.players) {
        if (target.id !== b.ownerId && target.alive) {
          const dist = Math.hypot(target.x - b.x, target.y - b.y);
          if (dist < target.radius + b.radius) {
            hitP = true;
            const attacker = this.players.find(p => p.id === b.ownerId);
            this.damagePlayer(target, b.damage, attacker);
            break;
          }
        }
      }

      if (hitP) {
        this.bullets.splice(i, 1);
        continue;
      }
    }

    // Update target opponent for Top HUD
    this.updateTargetOpponent();

    // Check Victory / Game Over
    const alivePlayers = this.players.filter(p => p.alive);
    if (alivePlayers.length <= 1 || (this.myPlayer && !this.myPlayer.alive)) {
      const winner = alivePlayers.find(p => p.placement === 1) || alivePlayers[0] || this.players[0];
      this.handleMatchGameOver(winner, this.players, Math.round(this.matchDuration));
    }

    // Update particle systems
    window.particleSystem.update(dt);
    window.obstacleRenderer.update(dt);
    window.powerupRenderer.update(dt);

    // Update Top HUD
    const livingCount = this.players.filter(p => p.alive).length;
    window.uiManager.updateHUD(
      this.myPlayer,
      this.currentOpponent,
      this.matchDuration,
      `${livingCount}/${this.players.length}`,
      this.storm && this.storm.active
    );

    // Update side roster for Survival mode
    if (this.mode === 'survival') {
      this.updateSurvivalRosterUI();
    }
  }

  updateBuffTimers(p, dt) {
    if (p.buffs.damageBoost > 0) p.buffs.damageBoost = Math.max(0, p.buffs.damageBoost - dt);
    if (p.buffs.timeSlowed > 0) p.buffs.timeSlowed = Math.max(0, p.buffs.timeSlowed - dt);
    if (p.buffs.cloneActive > 0) p.buffs.cloneActive = Math.max(0, p.buffs.cloneActive - dt);
    if (p.revealedTimer > 0) p.revealedTimer = Math.max(0, p.revealedTimer - dt);
  }

  moveEntityWithObstacleCollisions(ent, dt) {
    const nextX = ent.x + ent.vx * dt;
    const nextY = ent.y + ent.vy * dt;

    const clampedX = Math.max(ent.radius, Math.min(this.mapWidth - ent.radius, nextX));
    const clampedY = Math.max(ent.radius, Math.min(this.mapHeight - ent.radius, nextY));

    let resolvedX = clampedX;
    let resolvedY = clampedY;

    for (const obs of this.obstacles) {
      const nearestX = Math.max(obs.x, Math.min(resolvedX, obs.x + obs.width));
      const nearestY = Math.max(obs.y, Math.min(resolvedY, obs.y + obs.height));

      const dx = resolvedX - nearestX;
      const dy = resolvedY - nearestY;
      const distSq = dx * dx + dy * dy;

      if (distSq < ent.radius * ent.radius) {
        const dist = Math.sqrt(distSq) || 0.001;
        const overlap = ent.radius - dist;
        resolvedX += (dx / dist) * overlap;
        resolvedY += (dy / dist) * overlap;
      }
    }

    ent.x = resolvedX;
    ent.y = resolvedY;
  }

  checkStealthZone(p) {
    let inFog = false;
    for (const sz of this.stealthZones) {
      if (p.x >= sz.x && p.x <= sz.x + sz.width && p.y >= sz.y && p.y <= sz.y + sz.height) {
        inFog = true;
        break;
      }
    }
    p.stealth = inFog && (p.revealedTimer <= 0);
  }

  checkPowerupPickup(p) {
    for (let i = this.powerups.length - 1; i >= 0; i--) {
      const pup = this.powerups[i];
      const dist = Math.hypot(p.x - pup.x, p.y - pup.y);
      if (dist < p.radius + pup.radius) {
        p.powerupsCollected += 1;
        window.audioEngine.playPickup(pup.type);

        if (pup.type === 'damage') {
          p.buffs.damageBoost = pup.duration;
          window.particleSystem.addCombatText(p.x, p.y, '🔥 2.5x DAMAGE!', '#ff0055', true);
        } else if (pup.type === 'shield') {
          p.maxShield = 200;
          p.shield = 200;
          p.hasDoubleShield = true;
          p.buffs.shieldActive = true;
          window.particleSystem.createShieldRipple(p.x, p.y, '#00f3ff');
          window.particleSystem.addCombatText(p.x, p.y, '🛡️ 2x SHIELD OVERCHARGE!', '#00f3ff', true);
        } else if (pup.type === 'clone') {
          this.spawnClone(p);
          window.particleSystem.addCombatText(p.x, p.y, '🤖 CLONE MINION DEPLOYED!', '#00ff88', true);
        } else if (pup.type === 'slow') {
          // Slow down time for opponent!
          this.applyTimeSlow(p, pup.duration);
          window.audioEngine.playTimeSlowWarp();
          window.particleSystem.addCombatText(p.x, p.y, `⏳ CHRONO WARP (${pup.duration}s)!`, '#9d4edd', true);
        }

        this.powerups.splice(i, 1);
      }
    }
  }

  spawnClone(owner) {
    this.clones = this.clones.filter(c => c.ownerId !== owner.id);
    const clone = {
      id: 'clone_' + owner.id,
      ownerId: owner.id,
      username: `${owner.username}'s Drone`,
      x: owner.x - 50,
      y: owner.y - 50,
      radius: 20,
      angle: owner.angle,
      hp: 60,
      maxHp: 60,
      color: '#00ff88',
      alive: true,
      duration: 15,
      lifeTimer: 15,
      lastFireTime: 0,
      fireRate: 400
    };
    this.clones.push(clone);
    owner.buffs.cloneActive = 15;
  }

  applyTimeSlow(activator, duration) {
    this.players.forEach(p => {
      if (p.id !== activator.id && p.alive) {
        p.buffs.timeSlowed = duration;
      }
    });
  }

  fireBullet(shooter) {
    const now = performance.now();
    const slowFactor = shooter.buffs.timeSlowed > 0 ? 2.5 : 1.0;
    const interval = shooter.fireRate * slowFactor;

    if (now - shooter.lastFireTime < interval) return;
    shooter.lastFireTime = now;
    shooter.revealedTimer = 1.2; // reveal from fog

    const isEmpowered = shooter.buffs.damageBoost > 0;
    const speed = isEmpowered ? 760 : 650;
    const damage = isEmpowered ? 50 : 20;

    if (shooter === this.myPlayer) {
      if (isEmpowered) window.audioEngine.playHeavyShot();
      else window.audioEngine.playLaser();
      this.screenShake = 3;
    }

    this.bullets.push({
      id: Date.now() + Math.random(),
      ownerId: shooter.id,
      x: shooter.x + Math.cos(shooter.angle) * (shooter.radius + 12),
      y: shooter.y + Math.sin(shooter.angle) * (shooter.radius + 12),
      vx: Math.cos(shooter.angle) * speed,
      vy: Math.sin(shooter.angle) * speed,
      radius: isEmpowered ? 7 : 4.5,
      damage: damage,
      isEmpowered: isEmpowered,
      color: isEmpowered ? '#ff0055' : shooter.color,
      traveled: 0
    });
  }

  fireCloneBullet(clone, owner) {
    const angle = clone.angle + (Math.random() - 0.5) * 0.15;
    window.audioEngine.playCloneShot();
    this.bullets.push({
      id: Date.now() + Math.random(),
      ownerId: owner.id,
      x: clone.x + Math.cos(angle) * (clone.radius + 8),
      y: clone.y + Math.sin(angle) * (clone.radius + 8),
      vx: Math.cos(angle) * 580,
      vy: Math.sin(angle) * 580,
      radius: 4,
      damage: 14,
      color: '#00ff88',
      traveled: 0
    });
  }

  damagePlayer(target, damage, attacker = null) {
    if (!target.alive) return;

    if (attacker) {
      attacker.damageDealt += damage;
    }

    if (target === this.myPlayer) {
      this.screenShake = 6;
    }

    // Shield absorption
    if (target.shield > 0) {
      window.audioEngine.playShieldHit();
      window.particleSystem.createShieldRipple(target.x, target.y, '#00f3ff');
      if (target.shield >= damage) {
        target.shield -= damage;
        window.particleSystem.addCombatText(target.x, target.y, `-${Math.round(damage)} [SHIELD]`, '#00f3ff');
        damage = 0;
      } else {
        damage -= target.shield;
        target.shield = 0;
        target.hasDoubleShield = false;
        window.audioEngine.playShieldBreak();
        window.particleSystem.addCombatText(target.x, target.y, `SHIELD BROKEN!`, '#ff0055', true);
      }
    }

    if (damage > 0) {
      target.hp = Math.max(0, target.hp - damage);
      window.particleSystem.createSparks(target.x, target.y, '#ff0055', 12);
      window.particleSystem.addCombatText(target.x, target.y, `-${Math.round(damage)}`, '#ff0055');
    }

    if (target.hp <= 0) {
      target.alive = false;
      target.hp = 0;
      window.particleSystem.createExplosion(target.x, target.y, target.color, 40);
      window.audioEngine.playExplosion();

      if (attacker && attacker.id !== target.id) {
        attacker.kills += 1;
        window.particleSystem.addCombatText(attacker.x, attacker.y, `+1 KILL (${target.username})`, '#00ff88', true);
      }

      const living = this.players.filter(p => p.alive).length;
      target.placement = living + 1;
    }
  }

  updateTargetOpponent() {
    // Select nearest living opponent
    if (!this.myPlayer) return;
    let nearest = null;
    let minDist = 9999;
    for (const p of this.players) {
      if (p.id !== this.myPlayer.id && p.alive) {
        const d = Math.hypot(p.x - this.myPlayer.x, p.y - this.myPlayer.y);
        if (d < minDist) {
          minDist = d;
          nearest = p;
        }
      }
    }
    this.currentOpponent = nearest || this.players.find(p => p.id !== this.myPlayer.id) || null;
  }

  updateSurvivalRosterUI() {
    const container = document.getElementById('roster-entries');
    container.innerHTML = '';

    this.players.forEach(p => {
      const div = document.createElement('div');
      div.className = `roster-entry ${p.alive ? '' : 'eliminated'}`;
      const hpPct = Math.max(0, (p.hp / p.maxHp) * 100);

      div.innerHTML = `
        <span class="roster-entry-name" style="color: ${p.color}">${p.username}</span>
        <div class="roster-entry-bars">
          <div class="roster-entry-hp" style="width: ${hpPct}%;"></div>
        </div>
      `;
      container.appendChild(div);
    });
  }

  circleHitsRect(cx, cy, r, rx, ry, rw, rh) {
    const nx = Math.max(rx, Math.min(cx, rx + rw));
    const ny = Math.max(ry, Math.min(cy, ry + rh));
    const dx = cx - nx;
    const dy = cy - ny;
    return (dx * dx + dy * dy) < (r * r);
  }

  // ---------------- MULTIPLAYER SERVER SNAPSHOT SYNC ----------------
  applyServerSnapshot(snapshot) {
    this.obstacles = snapshot.obstacles;
    this.stealthZones = snapshot.stealthZones;
    this.powerups = snapshot.powerups;
    this.clones = snapshot.clones;
    this.bullets = snapshot.bullets;
    this.storm = snapshot.storm;

    const myId = window.uiManager.socket.id;
    this.players = snapshot.players;
    this.myPlayer = this.players.find(p => p.socketId === myId) || this.players[0];

    // Find rival for top HUD
    this.updateTargetOpponent();

    const living = this.players.filter(p => p.alive).length;
    window.uiManager.updateHUD(
      this.myPlayer,
      this.currentOpponent,
      snapshot.duration,
      `${living}/${this.players.length}`,
      this.storm && this.storm.active
    );

    if (this.mode === 'survival') {
      this.updateSurvivalRosterUI();
    }
  }

  // ---------------- MATCH RESULTS & PERSISTENCE (Requirements 2 & 7) ----------------
  handleMatchGameOver(winner, allParticipants, durationSec) {
    if (this.gameState === 'gameover') return;
    this.gameState = 'gameover';

    const modal = document.getElementById('result-modal');
    modal.classList.remove('hidden');

    const iWon = (winner && this.myPlayer && winner.id === this.myPlayer.id);

    if (iWon) {
      window.audioEngine.playVictory();
      document.getElementById('result-title').innerText = 'VICTORY // LAST OPERATIVE STANDING';
      document.getElementById('result-title').className = 'neon-cyan';
      document.getElementById('result-placement').innerText = '#1 SURVIVOR';
      document.getElementById('result-placement').style.background = 'var(--neon-green)';
    } else {
      document.getElementById('result-title').innerText = 'ELIMINATED // MISSION FAILED';
      document.getElementById('result-title').className = 'neon-red';
      const myPlacement = this.myPlayer ? (this.myPlayer.placement || 2) : 2;
      document.getElementById('result-placement').innerText = `#${myPlacement} PLACEMENT`;
      document.getElementById('result-placement').style.background = 'var(--neon-pink)';
    }

    // Populate Head-to-Head Comparison Card (Requirement 2)
    const rival = this.currentOpponent || allParticipants.find(p => p.id !== (this.myPlayer ? this.myPlayer.id : '')) || allParticipants[1] || {};

    document.getElementById('res-my-name').innerText = (this.myPlayer ? this.myPlayer.username : 'YOU');
    document.getElementById('res-my-avatar').innerText = (this.myPlayer ? this.myPlayer.avatar : '⚡');
    document.getElementById('res-my-kills').innerText = `KILLS: ${this.myPlayer ? this.myPlayer.kills : 0}`;
    document.getElementById('res-my-damage').innerText = `DAMAGE: ${Math.round(this.myPlayer ? this.myPlayer.damageDealt : 0)}`;

    document.getElementById('res-rival-name').innerText = rival.username || 'OPPONENT';
    document.getElementById('res-rival-avatar').innerText = rival.avatar || '💀';
    document.getElementById('res-rival-kills').innerText = `KILLS: ${rival.kills || 0}`;
    document.getElementById('res-rival-damage').innerText = `DAMAGE: ${Math.round(rival.damageDealt || 0)}`;

    const m = Math.floor(durationSec / 60).toString().padStart(2, '0');
    const s = Math.floor(durationSec % 60).toString().padStart(2, '0');
    document.getElementById('res-duration').innerText = `${m}:${s}`;

    // Update career record and persist locally + server (Requirement 7)
    const profile = window.uiManager.profile;
    profile.totalMatches = (profile.totalMatches || 0) + 1;
    profile.kills = (profile.kills || 0) + (this.myPlayer ? this.myPlayer.kills : 0);
    profile.deaths = (profile.deaths || 0) + (iWon ? 0 : 1);
    profile.damageDealt = (profile.damageDealt || 0) + Math.round(this.myPlayer ? this.myPlayer.damageDealt : 0);

    if (iWon) {
      profile.wins = (profile.wins || 0) + 1;
      profile.winStreak = (profile.winStreak || 0) + 1;
      if (profile.winStreak > (profile.bestWinStreak || 0)) {
        profile.bestWinStreak = profile.winStreak;
      }
    } else {
      profile.losses = (profile.losses || 0) + 1;
      profile.winStreak = 0;
    }

    // Add match to history log
    if (!profile.history) profile.history = [];
    profile.history.unshift({
      timestamp: new Date().toISOString(),
      mode: this.mode === '1v1' ? '1v1 Duel' : '10-Player Survival',
      won: iWon,
      kills: this.myPlayer ? this.myPlayer.kills : 0,
      damage: Math.round(this.myPlayer ? this.myPlayer.damageDealt : 0),
      opponents: [{ username: rival.username || 'Opponent' }]
    });

    window.uiManager.saveProfile();
    window.uiManager.updateProfileDisplay();

    // Send result to server REST endpoint
    fetch('/api/match-result', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        matchId: 'M-SOLO-' + Date.now().toString(36),
        mode: this.mode === '1v1' ? '1v1 Duel' : '10-Player Survival',
        duration: durationSec,
        participants: allParticipants.map(p => ({
          id: p.id,
          username: p.username,
          kills: p.kills || 0,
          damage: p.damageDealt || 0,
          isWinner: winner && winner.id === p.id,
          isBot: p.isBot || false
        }))
      })
    }).catch(() => {});
  }

  // ---------------- RENDERING ENGINE (Requirement 1 & 6) ----------------
  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Update Camera to follow player smoothly
    if (this.myPlayer) {
      const targetCamX = this.myPlayer.x - this.canvas.width / 2;
      const targetCamY = this.myPlayer.y - this.canvas.height / 2;
      this.camera.x += (targetCamX - this.camera.x) * 0.12;
      this.camera.y += (targetCamY - this.camera.y) * 0.12;
    }

    // Screen Shake application
    let shakeX = 0;
    let shakeY = 0;
    if (this.screenShake > 0) {
      shakeX = (Math.random() - 0.5) * this.screenShake * 2;
      shakeY = (Math.random() - 0.5) * this.screenShake * 2;
      this.screenShake *= 0.88;
      if (this.screenShake < 0.2) this.screenShake = 0;
    }

    const cam = {
      x: this.camera.x + shakeX,
      y: this.camera.y + shakeY
    };

    // Draw Cyber Arena Grid Floor
    this.drawGrid(ctx, cam);

    // Draw Stealth Camouflage Fog Zones (Requirement 5)
    this.stealthZones.forEach(sz => {
      window.obstacleRenderer.drawStealthZone(ctx, sz, cam);
    });

    // Draw Obstacles (Walls, Crates, Pillars) (Requirement 5)
    this.obstacles.forEach(obs => {
      window.obstacleRenderer.drawObstacle(ctx, obs, cam);
    });

    // Draw Power-ups (Requirement 4)
    this.powerups.forEach(pup => {
      window.powerupRenderer.drawPowerup(ctx, pup, cam);
    });

    // Draw Clones
    this.clones.forEach(clone => {
      this.drawClone(ctx, clone, cam);
    });

    // Draw Bullets
    this.bullets.forEach(b => {
      this.drawBullet(ctx, b, cam);
    });

    // Draw Players with Health Bars (Requirement 1)
    this.players.forEach(p => {
      if (p.alive) {
        this.drawPlayer(ctx, p, cam);
      }
    });

    // Draw Storm Danger Ring (Survival Mode)
    if (this.storm && this.storm.active) {
      this.drawStormRing(ctx, cam);
    }

    // Draw Particles & Floating Combat Texts
    window.particleSystem.draw(ctx, cam);

    // Draw Arena Minimap Radar
    this.drawMinimap();
  }

  drawGrid(ctx, cam) {
    const gridSize = 60;
    const startX = -cam.x % gridSize;
    const startY = -cam.y % gridSize;

    ctx.save();
    ctx.strokeStyle = 'rgba(0, 243, 255, 0.04)';
    ctx.lineWidth = 1;

    for (let x = startX; x < this.canvas.width; x += gridSize) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.canvas.height);
      ctx.stroke();
    }

    for (let y = startY; y < this.canvas.height; y += gridSize) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.canvas.width, y);
      ctx.stroke();
    }

    // World boundary border
    ctx.strokeStyle = 'rgba(255, 0, 85, 0.5)';
    ctx.lineWidth = 4;
    ctx.strokeRect(-cam.x, -cam.y, this.mapWidth, this.mapHeight);

    ctx.restore();
  }

  // Draw Player Model & OVERHEAD HEALTH / SHIELD BARS (Requirement 1)
  drawPlayer(ctx, p, cam) {
    const rx = p.x - cam.x;
    const ry = p.y - cam.y;

    // Line of sight stealth check: if in stealth and not self, hide or ghost
    if (p.stealth && p !== this.myPlayer) {
      // If local player is inside the same stealth zone, reveal
      let sharedFog = false;
      for (const sz of this.stealthZones) {
        const pIn = p.x >= sz.x && p.x <= sz.x + sz.width && p.y >= sz.y && p.y <= sz.y + sz.height;
        const myIn = this.myPlayer.x >= sz.x && this.myPlayer.x <= sz.x + sz.width && this.myPlayer.y >= sz.y && this.myPlayer.y <= sz.y + sz.height;
        if (pIn && myIn) {
          sharedFog = true;
          break;
        }
      }
      if (!sharedFog) return; // Completely invisible to rivals outside!
    }

    ctx.save();
    if (p.stealth) ctx.globalAlpha = 0.4; // Semi-transparent when concealed

    // 1. Time Slow Distorted Field (Requirement 4)
    if (p.buffs.timeSlowed > 0) {
      ctx.strokeStyle = 'rgba(157, 78, 221, 0.8)';
      ctx.lineWidth = 3;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(rx, ry, p.radius + 14, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // 2. 2x Shield Energy Bubble (Requirement 4)
    if (p.shield > 0) {
      ctx.strokeStyle = p.hasDoubleShield ? 'rgba(0, 243, 255, 0.9)' : 'rgba(0, 163, 255, 0.6)';
      ctx.lineWidth = p.hasDoubleShield ? 3.5 : 2;
      ctx.beginPath();
      ctx.arc(rx, ry, p.radius + 8, 0, Math.PI * 2);
      ctx.stroke();

      // Shield glow
      ctx.fillStyle = p.hasDoubleShield ? 'rgba(0, 243, 255, 0.12)' : 'rgba(0, 163, 255, 0.06)';
      ctx.fill();
    }

    // 3. Player Body & Aim Cannon
    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(p.angle);

    // Weapon Barrel
    ctx.fillStyle = p.buffs.damageBoost > 0 ? '#ff0055' : '#475569';
    ctx.fillRect(10, -5, 22, 10);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(10, -5, 22, 10);

    // Player Core Chassis
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(0, 0, p.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = p.color;
    ctx.lineWidth = 3;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 10;
    ctx.stroke();

    // Inner Emblem / Avatar
    ctx.fillStyle = '#fff';
    ctx.font = '14px "Orbitron"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.avatar || '⚡', 0, 0);

    ctx.restore();

    // ---------------- OVERHEAD HEALTH & SHIELD BAR (Requirement 1) ----------------
    const barWidth = 56;
    const barHeight = 5;
    const barX = rx - barWidth / 2;
    const hpBarY = ry - p.radius - 14;
    const shieldBarY = hpBarY - 6;

    // Overhead Shield Bar (if shield > 0)
    if (p.shield > 0) {
      const shieldPct = Math.max(0, Math.min(1, p.shield / p.maxShield));
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(barX, shieldBarY, barWidth, 3);
      ctx.fillStyle = p.hasDoubleShield ? '#00f3ff' : '#00a8ff';
      ctx.shadowColor = '#00f3ff';
      ctx.shadowBlur = 6;
      ctx.fillRect(barX, shieldBarY, barWidth * shieldPct, 3);
      ctx.shadowBlur = 0;
    }

    // Overhead Health Bar
    const hpPct = Math.max(0, Math.min(1, p.hp / p.maxHp));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(barX, hpBarY, barWidth, barHeight);

    ctx.fillStyle = hpPct > 0.4 ? '#00ff88' : '#ff0055';
    ctx.shadowColor = ctx.fillStyle;
    ctx.shadowBlur = 6;
    ctx.fillRect(barX, hpBarY, barWidth * hpPct, barHeight);
    ctx.shadowBlur = 0;

    // Overhead Username & Status Label
    ctx.font = '700 11px "Rajdhani"';
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.fillText(p.username, rx, hpBarY - (p.shield > 0 ? 10 : 6));

    ctx.restore();
  }

  drawClone(ctx, clone, cam) {
    const rx = clone.x - cam.x;
    const ry = clone.y - cam.y;

    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(clone.angle);

    // Holographic flicker
    ctx.globalAlpha = 0.75 + Math.sin(performance.now() * 0.02) * 0.2;

    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(0, 0, clone.radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#00ff88';
    ctx.fillRect(6, -3, 14, 6);

    ctx.restore();
  }

  drawBullet(ctx, b, cam) {
    const rx = b.x - cam.x;
    const ry = b.y - cam.y;

    ctx.save();
    ctx.fillStyle = b.color;
    ctx.shadowColor = b.color;
    ctx.shadowBlur = b.isEmpowered ? 16 : 8;

    ctx.beginPath();
    ctx.arc(rx, ry, b.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  drawStormRing(ctx, cam) {
    const cx = this.storm.x - cam.x;
    const cy = this.storm.y - cam.y;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 0, 85, 0.85)';
    ctx.lineWidth = 6;
    ctx.setLineDash([16, 10]);
    ctx.shadowColor = '#ff0055';
    ctx.shadowBlur = 18;

    ctx.beginPath();
    ctx.arc(cx, cy, this.storm.radius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
  }

  // Tactical Minimap Radar
  drawMinimap() {
    const mCtx = this.minimapCtx;
    const w = this.minimapCanvas.width;
    const h = this.minimapCanvas.height;

    mCtx.clearRect(0, 0, w, h);
    mCtx.fillStyle = 'rgba(8, 12, 20, 0.9)';
    mCtx.fillRect(0, 0, w, h);

    const scaleX = w / this.mapWidth;
    const scaleY = h / this.mapHeight;

    // Obstacles
    mCtx.fillStyle = 'rgba(255, 255, 255, 0.2)';
    this.obstacles.forEach(o => {
      mCtx.fillRect(o.x * scaleX, o.y * scaleY, o.width * scaleX, o.height * scaleY);
    });

    // Stealth Fog
    mCtx.fillStyle = 'rgba(0, 255, 136, 0.25)';
    this.stealthZones.forEach(sz => {
      mCtx.fillRect(sz.x * scaleX, sz.y * scaleY, sz.width * scaleX, sz.height * scaleY);
    });

    // Power-ups
    this.powerups.forEach(pup => {
      mCtx.fillStyle = window.powerupRenderer.getColorForType(pup.type);
      mCtx.beginPath();
      mCtx.arc(pup.x * scaleX, pup.y * scaleY, 3, 0, Math.PI * 2);
      mCtx.fill();
    });

    // Players
    this.players.forEach(p => {
      if (!p.alive) return;
      if (p.stealth && p !== this.myPlayer) return; // Hidden from radar!
      mCtx.fillStyle = (p === this.myPlayer) ? '#00f3ff' : '#ff0055';
      mCtx.beginPath();
      mCtx.arc(p.x * scaleX, p.y * scaleY, p === this.myPlayer ? 4 : 3, 0, Math.PI * 2);
      mCtx.fill();
    });
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.gameInstance = new YoloGame();
});
