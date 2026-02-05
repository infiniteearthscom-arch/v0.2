import { Server } from 'socket.io';
import { socketAuthMiddleware, updateUserOnline } from '../auth/index.js';
import { query, queryOne, queryAll } from '../db/index.js';

// ============================================
// GAME STATE
// ============================================

// In-memory state for real-time data
const gameState = {
  // Hub instances: hubId -> { players: Map<odid, playerState>, lastUpdate }
  hubs: new Map(),
  
  // Mission instances: missionId -> { players, state, lastUpdate }
  missions: new Map(),
  
  // Player socket mapping: odid -> socket
  playerSockets: new Map(),
  
  // Player presence: odid -> { odId, odType, shipId }
  playerPresence: new Map(),
};

// ============================================
// SETUP SOCKET.IO
// ============================================

export const setupSocketIO = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin: process.env.CLIENT_URL || 'http://localhost:5173',
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  // Authentication middleware
  io.use(socketAuthMiddleware);

  io.on('connection', async (socket) => {
    const user = socket.user;
    console.log(`🔌 Player connected: ${user.username} (${socket.id})`);

    // Store socket reference
    gameState.playerSockets.set(user.id, socket);

    // Update online status
    await updateUserOnline(user.id, true);

    // Update presence in DB
    await query(
      `INSERT INTO player_presence (user_id, socket_id, connected_at, last_heartbeat)
       VALUES ($1, $2, NOW(), NOW())
       ON CONFLICT (user_id) DO UPDATE SET socket_id = $2, last_heartbeat = NOW()`,
      [user.id, socket.id]
    );

    // Send initial state
    socket.emit('connected', {
      userId: user.id,
      username: user.username,
    });

    // ==========================================
    // HUB EVENTS
    // ==========================================

    // Join a hub
    socket.on('hub:join', async (data) => {
      try {
        const { hubId, shipId } = data;

        // Validate ship ownership
        const ship = await queryOne(
          `SELECT * FROM ships WHERE id = $1 AND user_id = $2`,
          [shipId, user.id]
        );

        if (!ship) {
          return socket.emit('error', { message: 'Ship not found' });
        }

        // Leave any current hub
        const currentPresence = gameState.playerPresence.get(user.id);
        if (currentPresence?.hubId) {
          socket.leave(`hub:${currentPresence.hubId}`);
          const hub = gameState.hubs.get(currentPresence.hubId);
          if (hub) {
            hub.players.delete(user.id);
            io.to(`hub:${currentPresence.hubId}`).emit('hub:playerLeft', { odId: user.id });
          }
        }

        // Initialize hub if needed
        if (!gameState.hubs.has(hubId)) {
          gameState.hubs.set(hubId, {
            players: new Map(),
            lastUpdate: Date.now(),
          });
        }

        const hub = gameState.hubs.get(hubId);

        // Check capacity
        const maxPlayers = parseInt(process.env.MAX_PLAYERS_PER_HUB) || 100;
        if (hub.players.size >= maxPlayers) {
          return socket.emit('error', { message: 'Hub is full' });
        }

        // Create player state
        const playerState = {
          odId: user.id,
          username: user.username,
          shipId: ship.id,
          shipName: ship.name,
          x: ship.position_x || Math.random() * 1000,
          y: ship.position_y || Math.random() * 1000,
          rotation: ship.rotation || 0,
          velocityX: 0,
          velocityY: 0,
        };

        // Add to hub
        hub.players.set(user.id, playerState);
        socket.join(`hub:${hubId}`);

        // Update presence
        gameState.playerPresence.set(user.id, {
          type: 'hub',
          hubId,
          shipId,
        });

        // Update DB
        await query(
          `UPDATE player_presence SET location_type = 'hub', location_id = $1, active_ship_id = $2 WHERE user_id = $3`,
          [hubId, shipId, user.id]
        );

        await query(
          `UPDATE ships SET location_type = 'hub', location_id = $1 WHERE id = $2`,
          [hubId, shipId]
        );

        // Send current hub state to joining player
        const playersArray = Array.from(hub.players.values());
        socket.emit('hub:joined', {
          hubId,
          players: playersArray,
          yourState: playerState,
        });

        // Notify others
        socket.to(`hub:${hubId}`).emit('hub:playerJoined', playerState);

        console.log(`👥 ${user.username} joined hub ${hubId} (${hub.players.size} players)`);
      } catch (error) {
        console.error('Hub join error:', error);
        socket.emit('error', { message: 'Failed to join hub' });
      }
    });

    // Update player position/state
    socket.on('hub:update', (data) => {
      const presence = gameState.playerPresence.get(user.id);
      if (!presence?.hubId) return;

      const hub = gameState.hubs.get(presence.hubId);
      if (!hub) return;

      const playerState = hub.players.get(user.id);
      if (!playerState) return;

      // Update state
      if (data.x !== undefined) playerState.x = data.x;
      if (data.y !== undefined) playerState.y = data.y;
      if (data.rotation !== undefined) playerState.rotation = data.rotation;
      if (data.velocityX !== undefined) playerState.velocityX = data.velocityX;
      if (data.velocityY !== undefined) playerState.velocityY = data.velocityY;

      // Broadcast to others in hub
      socket.to(`hub:${presence.hubId}`).emit('hub:playerUpdate', {
        odId: user.id,
        ...data,
      });
    });

    // Leave hub
    socket.on('hub:leave', async () => {
      await leaveHub(socket, user);
    });

    // ==========================================
    // CHAT EVENTS
    // ==========================================

    socket.on('chat:send', async (data) => {
      const { channel, message } = data;

      if (!message || message.length > 500) return;

      const presence = gameState.playerPresence.get(user.id);

      // Determine channel
      let channelType = 'global';
      let channelId = null;
      let room = null;

      if (channel === 'hub' && presence?.hubId) {
        channelType = 'hub';
        channelId = presence.hubId;
        room = `hub:${presence.hubId}`;
      } else if (channel === 'mission' && presence?.missionId) {
        channelType = 'mission';
        channelId = presence.missionId;
        room = `mission:${presence.missionId}`;
      }

      const chatMessage = {
        id: Date.now().toString(36),
        channelType,
        channelId,
        senderId: user.id,
        senderName: user.username,
        content: message,
        timestamp: Date.now(),
      };

      // Store in DB (async, don't wait)
      query(
        `INSERT INTO chat_messages (channel_type, channel_id, sender_id, sender_name, content)
         VALUES ($1, $2, $3, $4, $5)`,
        [channelType, channelId, user.id, user.username, message]
      ).catch(err => console.error('Chat save error:', err));

      // Broadcast
      if (room) {
        io.to(room).emit('chat:message', chatMessage);
      } else {
        io.emit('chat:message', chatMessage);
      }
    });

    // ==========================================
    // MISSION EVENTS
    // ==========================================

    socket.on('mission:create', async (data) => {
      try {
        const { type, difficulty } = data;
        const presence = gameState.playerPresence.get(user.id);

        if (!presence?.shipId) {
          return socket.emit('error', { message: 'No active ship' });
        }

        // Create mission in DB
        const mission = await queryOne(
          `INSERT INTO mission_instances (mission_type, difficulty, leader_id, player_ids, max_players)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING *`,
          [type, difficulty || 1, user.id, JSON.stringify([user.id]), 4]
        );

        // Initialize in-memory state
        gameState.missions.set(mission.id, {
          players: new Map([[user.id, { odId: user.id, username: user.username, ready: false }]]),
          state: { phase: 'forming' },
          lastUpdate: Date.now(),
        });

        socket.join(`mission:${mission.id}`);

        socket.emit('mission:created', { mission });
        console.log(`🎯 ${user.username} created mission ${mission.id}`);
      } catch (error) {
        console.error('Mission create error:', error);
        socket.emit('error', { message: 'Failed to create mission' });
      }
    });

    socket.on('mission:join', async (data) => {
      try {
        const { missionId } = data;

        const mission = await queryOne(
          `SELECT * FROM mission_instances WHERE id = $1 AND status = 'forming'`,
          [missionId]
        );

        if (!mission) {
          return socket.emit('error', { message: 'Mission not found or already started' });
        }

        const missionState = gameState.missions.get(missionId);
        if (!missionState) {
          return socket.emit('error', { message: 'Mission not active' });
        }

        if (missionState.players.size >= mission.max_players) {
          return socket.emit('error', { message: 'Mission is full' });
        }

        // Add player
        missionState.players.set(user.id, { odId: user.id, username: user.username, ready: false });

        // Update DB
        const playerIds = Array.from(missionState.players.keys());
        await query(
          `UPDATE mission_instances SET player_ids = $1 WHERE id = $2`,
          [JSON.stringify(playerIds), missionId]
        );

        socket.join(`mission:${missionId}`);

        io.to(`mission:${missionId}`).emit('mission:playerJoined', {
          odId: user.id,
          username: user.username,
          players: Array.from(missionState.players.values()),
        });
      } catch (error) {
        console.error('Mission join error:', error);
        socket.emit('error', { message: 'Failed to join mission' });
      }
    });

    // ==========================================
    // DISCONNECT
    // ==========================================

    socket.on('disconnect', async () => {
      console.log(`🔌 Player disconnected: ${user.username}`);

      await leaveHub(socket, user);

      // Update online status
      await updateUserOnline(user.id, false);

      // Clean up presence
      await query(`DELETE FROM player_presence WHERE user_id = $1`, [user.id]);

      gameState.playerSockets.delete(user.id);
      gameState.playerPresence.delete(user.id);
    });
  });

  // ==========================================
  // GAME TICK (Server-authoritative updates)
  // ==========================================

  const TICK_RATE = parseInt(process.env.TICK_RATE) || 20;
  const TICK_INTERVAL = 1000 / TICK_RATE;

  setInterval(() => {
    // Update each active hub
    gameState.hubs.forEach((hub, hubId) => {
      if (hub.players.size === 0) return;

      // Collect all player states
      const states = Array.from(hub.players.values()).map(p => ({
        odId: p.odId,
        x: p.x,
        y: p.y,
        rotation: p.rotation,
        velocityX: p.velocityX,
        velocityY: p.velocityY,
      }));

      // Broadcast tick to all players in hub
      io.to(`hub:${hubId}`).emit('hub:tick', {
        timestamp: Date.now(),
        players: states,
      });
    });
  }, TICK_INTERVAL);

  // Cleanup inactive hubs periodically
  setInterval(() => {
    const now = Date.now();
    gameState.hubs.forEach((hub, hubId) => {
      if (hub.players.size === 0 && now - hub.lastUpdate > 60000) {
        gameState.hubs.delete(hubId);
        console.log(`🧹 Cleaned up empty hub ${hubId}`);
      }
    });
  }, 60000);

  return io;
};

// ============================================
// HELPER FUNCTIONS
// ============================================

async function leaveHub(socket, user) {
  const presence = gameState.playerPresence.get(user.id);
  if (!presence?.hubId) return;

  const hub = gameState.hubs.get(presence.hubId);
  if (hub) {
    const playerState = hub.players.get(user.id);

    // Save position to DB before leaving
    if (playerState && presence.shipId) {
      await query(
        `UPDATE ships SET position_x = $1, position_y = $2, rotation = $3 WHERE id = $4`,
        [playerState.x, playerState.y, playerState.rotation, presence.shipId]
      ).catch(err => console.error('Save position error:', err));
    }

    hub.players.delete(user.id);
    hub.lastUpdate = Date.now();

    socket.to(`hub:${presence.hubId}`).emit('hub:playerLeft', { odId: user.id });
  }

  socket.leave(`hub:${presence.hubId}`);
  gameState.playerPresence.delete(user.id);
}

export default setupSocketIO;
