const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const db = require('./database');
const { RoomState } = require('./gameEngine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = parseInt(process.env.PORT, 10) || 3050;

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------------- REST API ----------------

// Health check endpoint for Internet Connection verification
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    serverTime: Date.now(),
    game: 'Y.O.L.O',
    tagline: 'You Only Live Once'
  });
});

// Get player profile and match history
app.get('/api/profile/:id', (req, res) => {
  const player = db.getPlayer(req.params.id);
  if (!player) {
    return res.status(404).json({ error: 'Player not found' });
  }
  const kd = player.deaths === 0 ? player.kills : +(player.kills / player.deaths).toFixed(2);
  const winRate = player.totalMatches === 0 ? 0 : Math.round((player.wins / player.totalMatches) * 100);
  res.json({
    ...player,
    kdRatio: kd,
    winRate: winRate
  });
});

// Update or create profile
app.post('/api/profile', (req, res) => {
  const { id, username, avatar, color } = req.body;
  if (!username) {
    return res.status(400).json({ error: 'Username is required' });
  }
  const player = db.getOrCreatePlayer(id || username, username);
  if (avatar) player.avatar = avatar;
  if (color) player.color = color;
  if (username) player.username = username;
  db.save();
  res.json(player);
});

// Get Leaderboard
app.get('/api/leaderboard', (req, res) => {
  const limit = parseInt(req.query.limit) || 15;
  res.json(db.getLeaderboard(limit));
});

// Get Recent Matches
app.get('/api/matches', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(db.getRecentMatches(limit));
});

// Record Completed Match (supports both Solo vs Bot and Multiplayer)
app.post('/api/match-result', (req, res) => {
  const matchData = req.body;
  if (!matchData || !matchData.participants) {
    return res.status(400).json({ error: 'Invalid match data' });
  }
  const record = db.recordMatchResult(matchData);
  res.json({ success: true, match: record });
});

// ---------------- SOCKET.IO REALTIME MULTIPLAYER ----------------

const rooms = new Map(); // roomId -> RoomState
const roomLoops = new Map(); // roomId -> intervalId
const socketToRoom = new Map(); // socketId -> roomId

// Helper to broadcast room list
function broadcastRoomsList() {
  const list = [];
  for (const [id, r] of rooms.entries()) {
    if (r.status !== 'finished') {
      list.push({
        id: r.roomId,
        mode: r.mode,
        status: r.status,
        playerCount: r.players.size,
        maxPlayers: r.maxPlayers,
        isCustom: r.isCustom,
        players: Array.from(r.players.values()).map(p => ({
          username: p.username,
          avatar: p.avatar,
          color: p.color,
          isHost: p.isHost,
          isBot: p.isBot
        }))
      });
    }
  }
  io.emit('rooms-updated', list);
}

function stopRoomLoop(roomId) {
  if (roomLoops.has(roomId)) {
    clearInterval(roomLoops.get(roomId));
    roomLoops.delete(roomId);
  }
}

function startRoomGame(roomId) {
  const room = rooms.get(roomId);
  if (!room || room.status === 'active') return;

  room.start();
  io.to(roomId).emit('match-started', {
    roomId: roomId,
    mode: room.mode,
    mapData: {
      width: room.mapData.width,
      height: room.mapData.height,
      obstacles: room.obstacles,
      stealthZones: room.stealthZones,
      powerups: room.powerups
    }
  });

  // Game Loop at 30 ticks per second (33ms)
  const interval = setInterval(() => {
    try {
      const now = Date.now();
      const dt = Math.min((now - room.lastTick) / 1000, 0.1);
      room.lastTick = now;

      // Update bot behavior if any in room
      updateRoomBots(room, dt);

      // Advance physics & game state
      room.tick(dt);

      // Broadcast snapshot to all room clients
      const snapshot = room.getSnapshot();
      io.to(roomId).emit('game-update', snapshot);

      // Check if match completed
      if (room.status === 'finished') {
        stopRoomLoop(roomId);
        handleRoomMatchEnd(room);
      }
    } catch (err) {
      console.error('Error in room tick loop:', err);
    }
  }, 1000 / 30);

  roomLoops.set(roomId, interval);
  broadcastRoomsList();
}

function updateRoomBots(room, dt) {
  for (const bot of room.players.values()) {
    if (!bot.isBot || !bot.alive) continue;

    // Smart bot logic: find nearest living opponent or powerup
    let target = null;
    let minDist = 9999;
    for (const other of room.players.values()) {
      if (other.id !== bot.id && other.alive && !other.stealth) {
        const d = Math.hypot(other.x - bot.x, other.y - bot.y);
        if (d < minDist) {
          minDist = d;
          target = other;
        }
      }
    }

    // Power-up attraction if nearby or bot HP is low
    let targetPowerup = null;
    if (bot.hp < 70 || Math.random() < 0.3) {
      let minPupDist = 450;
      for (const pup of room.powerups) {
        const d = Math.hypot(pup.x - bot.x, pup.y - bot.y);
        if (d < minPupDist) {
          minPupDist = d;
          targetPowerup = pup;
        }
      }
    }

    let goalX = bot.x;
    let goalY = bot.y;

    if (targetPowerup) {
      goalX = targetPowerup.x;
      goalY = targetPowerup.y;
    } else if (target) {
      // Keep tactical engagement distance (180 - 320 px)
      const angle = Math.atan2(target.y - bot.y, target.x - bot.x);
      bot.angle = angle;

      if (minDist > 280) {
        goalX = target.x;
        goalY = target.y;
      } else if (minDist < 160) {
        // Backpedal / retreat
        goalX = bot.x - Math.cos(angle) * 150;
        goalY = bot.y - Math.sin(angle) * 150;
      } else {
        // Strafe
        goalX = bot.x + Math.cos(angle + Math.PI / 2) * 100;
        goalY = bot.y + Math.sin(angle + Math.PI / 2) * 100;
      }

      // Shoot at target if line of sight is roughly clear
      if (Math.random() < 0.35) {
        room.playerFire(bot, angle + (Math.random() - 0.5) * 0.12);
      }
    } else {
      // Wander towards map center
      goalX = room.mapData.width / 2;
      goalY = room.mapData.height / 2;
    }

    // Move bot towards goal
    const moveAngle = Math.atan2(goalY - bot.y, goalX - bot.x);
    const slowFactor = bot.buffs.timeSlowed > 0 ? 0.4 : 1.0;
    bot.vx = Math.cos(moveAngle) * bot.speed * 0.85 * slowFactor;
    bot.vy = Math.sin(moveAngle) * bot.speed * 0.85 * slowFactor;
  }
}

function handleRoomMatchEnd(room) {
  const participants = Array.from(room.players.values()).map(p => ({
    id: p.id,
    username: p.username,
    kills: p.kills,
    damage: p.damageDealt,
    died: !p.alive || p.placement !== 1,
    placement: p.placement || (p.alive ? 1 : 2),
    isWinner: p.placement === 1 || p.alive,
    isBot: p.isBot
  }));

  const winner = participants.find(p => p.isWinner) || participants[0];

  const matchRecord = db.recordMatchResult({
    matchId: 'M-' + room.roomId + '-' + Date.now().toString(36),
    mode: room.mode === '1v1' ? '1v1 Online Duel' : 'Survival of the Fittest (Online)',
    duration: Math.round(room.matchDuration),
    timestamp: new Date().toISOString(),
    participants: participants
  });

  io.to(room.roomId).emit('match-ended', {
    winner: winner,
    participants: participants,
    matchRecord: matchRecord,
    duration: Math.round(room.matchDuration)
  });

  // Delay cleanup
  setTimeout(() => {
    rooms.delete(room.roomId);
    broadcastRoomsList();
  }, 10000);
}

io.on('connection', (socket) => {
  // Send active rooms list immediately
  socket.emit('rooms-updated', Array.from(rooms.values()).map(r => ({
    id: r.roomId,
    mode: r.mode,
    status: r.status,
    playerCount: r.players.size,
    maxPlayers: r.maxPlayers,
    players: Array.from(r.players.values()).map(p => ({
      username: p.username,
      avatar: p.avatar,
      color: p.color
    }))
  })));

  // Join or Create Room
  socket.on('create-room', ({ roomId, mode, profile }) => {
    const rId = (roomId || 'ROOM-' + Math.floor(1000 + Math.random() * 9000)).toUpperCase();
    if (rooms.has(rId)) {
      socket.emit('room-error', 'Room already exists with this code.');
      return;
    }

    const room = new RoomState(rId, mode || '1v1', true);
    rooms.set(rId, room);
    socket.join(rId);
    socketToRoom.set(socket.id, rId);

    const player = room.addPlayer(socket.id, profile || {});
    socket.emit('room-joined', {
      roomId: rId,
      player: player,
      isHost: true,
      roomSnapshot: room.getSnapshot()
    });

    broadcastRoomsList();
  });

  socket.on('join-room', ({ roomId, profile }) => {
    const rId = (roomId || '').trim().toUpperCase();
    const room = rooms.get(rId);

    if (!room) {
      socket.emit('room-error', 'Room not found.');
      return;
    }

    if (room.status !== 'waiting') {
      socket.emit('room-error', 'Match is already in progress.');
      return;
    }

    if (room.players.size >= room.maxPlayers) {
      socket.emit('room-error', 'Room is full (max ' + room.maxPlayers + ' players).');
      return;
    }

    socket.join(rId);
    socketToRoom.set(socket.id, rId);

    const player = room.addPlayer(socket.id, profile || {});
    socket.emit('room-joined', {
      roomId: rId,
      player: player,
      isHost: player.isHost,
      roomSnapshot: room.getSnapshot()
    });

    io.to(rId).emit('room-players-updated', {
      players: Array.from(room.players.values()).map(p => ({
        id: p.id,
        socketId: p.socketId,
        username: p.username,
        avatar: p.avatar,
        color: p.color,
        isHost: p.isHost,
        ready: p.ready,
        isBot: p.isBot
      }))
    });

    broadcastRoomsList();
  });

  // Host adds bot to fill room
  socket.on('add-bot', () => {
    const rId = socketToRoom.get(socket.id);
    const room = rooms.get(rId);
    if (!room || room.status !== 'waiting') return;

    const host = room.players.get(socket.id);
    if (!host || !host.isHost) return;

    if (room.players.size >= room.maxPlayers) return;

    const botNames = ['Shadow-9', 'Vortex', 'Cyber-Reaper', 'Ghost-X', 'Titan-V', 'Nyx', 'Apex-7', 'Blitz', 'Sentinel'];
    const botColors = ['#ff0055', '#ffb703', '#9d4edd', '#00ff88', '#ff3366', '#3a86ff'];
    const chosenName = botNames[room.players.size % botNames.length];
    const chosenColor = botColors[room.players.size % botColors.length];

    const botId = 'bot_' + Math.floor(1000 + Math.random() * 9000);
    room.addPlayer(botId, {
      id: botId,
      username: chosenName,
      avatar: 'cyber-cyborg',
      color: chosenColor
    }, true);

    io.to(rId).emit('room-players-updated', {
      players: Array.from(room.players.values()).map(p => ({
        id: p.id,
        socketId: p.socketId,
        username: p.username,
        avatar: p.avatar,
        color: p.color,
        isHost: p.isHost,
        ready: p.ready,
        isBot: p.isBot
      }))
    });

    broadcastRoomsList();
  });

  // Host starts the match
  socket.on('start-room-match', () => {
    const rId = socketToRoom.get(socket.id);
    const room = rooms.get(rId);
    if (!room || room.status !== 'waiting') return;

    const host = room.players.get(socket.id);
    if (!host || !host.isHost) return;

    if (room.players.size < 2) {
      socket.emit('room-error', 'Need at least 2 players or add a Bot to start!');
      return;
    }

    startRoomGame(rId);
  });

  // Real-time player input
  socket.on('player-input', (input) => {
    const rId = socketToRoom.get(socket.id);
    const room = rooms.get(rId);
    if (room && room.status === 'active') {
      room.handlePlayerInput(socket.id, input);
    }
  });

  // In-game tactical chat / quick taunts
  socket.on('send-chat', (text) => {
    const rId = socketToRoom.get(socket.id);
    const room = rooms.get(rId);
    if (room) {
      const sender = room.players.get(socket.id);
      if (sender) {
        io.to(rId).emit('chat-message', {
          sender: sender.username,
          color: sender.color,
          text: (text || '').slice(0, 80),
          time: Date.now()
        });
      }
    }
  });

  // Player inspect opponent profile request
  socket.on('inspect-opponent', (targetUsernameOrId) => {
    const p = db.getPlayer(targetUsernameOrId);
    socket.emit('opponent-dossier', p || null);
  });

  // Disconnect
  socket.on('disconnect', () => {
    const rId = socketToRoom.get(socket.id);
    if (rId && rooms.has(rId)) {
      const room = rooms.get(rId);
      const removed = room.removePlayer(socket.id);
      socketToRoom.delete(socket.id);

      if (removed) {
        io.to(rId).emit('player-left', {
          username: removed.username,
          players: Array.from(room.players.values()).map(p => ({
            id: p.id,
            username: p.username,
            avatar: p.avatar,
            color: p.color
          }))
        });

        // If no players remain in room, clean it up
        const humanCount = Array.from(room.players.values()).filter(p => !p.isBot).length;
        if (humanCount === 0) {
          stopRoomLoop(rId);
          rooms.delete(rId);
        } else if (room.status === 'waiting') {
          // Reassign host
          const remaining = Array.from(room.players.values());
          if (remaining.length > 0 && !remaining[0].isBot) {
            remaining[0].isHost = true;
          }
        }
        broadcastRoomsList();
      }
    }
  });
});

function startServer(port) {
  server.listen(port, '0.0.0.0', () => {
    console.log(`=========================================`);
    console.log(`  Y.O.L.O (You Only Live Once) Shooter   `);
    console.log(`  Server live on http://localhost:${port} `);
    console.log(`=========================================`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`Port ${port} in use, trying port ${port + 1}...`);
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(PORT);
