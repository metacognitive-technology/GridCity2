
import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import Database from 'better-sqlite3';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  transports: ['websocket', 'polling'], // WebSocket first, with polling fallback for proxies
  allowEIO3: true,
  pingTimeout: 60000,
  pingInterval: 25000
});

const PORT = parseInt(process.env.PORT || '3000', 10);
const DB_PATH = process.env.NODE_ENV === 'production' ? '/app/data/gridcity.db' : './gridcity.db';

// Ensure data directory exists if needed
const db = new Database(DB_PATH);

// Initialize Database Schema
db.exec(`
  CREATE TABLE IF NOT EXISTS worlds (
    id TEXT PRIMARY KEY,
    grid TEXT DEFAULT '{}',
    vehicles TEXT DEFAULT '{}',
    updatedAt INTEGER
  );
  
  CREATE TABLE IF NOT EXISTS layouts (
    id TEXT PRIMARY KEY,
    name TEXT,
    data TEXT,
    updatedAt INTEGER
  );
  
  CREATE TABLE IF NOT EXISTS simulations (
    id TEXT PRIMARY KEY,
    name TEXT,
    data TEXT,
    updatedAt INTEGER
  );
`);

// Add economy column if missing (safe for existing DBs)
try {
  db.exec(`ALTER TABLE worlds ADD COLUMN economy TEXT DEFAULT '{}';`);
} catch (e) {
  // column already exists
}

try {
  db.exec(`ALTER TABLE worlds ADD COLUMN traffic TEXT DEFAULT '{}';`);
} catch (e) {
  // column already exists
}

app.use(express.json());

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Simple health endpoint for Docker healthchecks and landing page monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'gridcity' });
});

// One sim leader per room runs vehicle/economy/traffic ticks; others receive broadcasts.
const roomSimLeaders = new Map<string, string>();

/** Short-lived per-cell edit locks to serialize rapid simultaneous grid edits. */
const CELL_LOCK_TTL_MS = 450;
const roomCellLocks = new Map<string, Map<string, { socketId: string; expiresAt: number }>>();

function getRoomLocks(roomCode: string): Map<string, { socketId: string; expiresAt: number }> {
  let locks = roomCellLocks.get(roomCode);
  if (!locks) {
    locks = new Map();
    roomCellLocks.set(roomCode, locks);
  }
  return locks;
}

function pruneExpiredLocks(locks: Map<string, { socketId: string; expiresAt: number }>, now: number) {
  for (const [key, lock] of locks) {
    if (lock.expiresAt <= now) locks.delete(key);
  }
}

function removeSocketLocks(socket: Socket) {
  for (const roomCode of socket.rooms) {
    if (roomCode === socket.id) continue;
    const locks = roomCellLocks.get(roomCode);
    if (locks) {
      for (const [key, lock] of locks) {
        if (lock.socketId === socket.id) locks.delete(key);
      }
    }
  }
}

function pickRoomSimLeader(roomCode: string, excludeSocketId?: string): string | null {
  const room = io.sockets.adapter.rooms.get(roomCode);
  if (!room) return null;
  const members = [...room].filter(id => id !== roomCode && id !== excludeSocketId).sort();
  return members[0] ?? null;
}

function broadcastRoomSimRole(roomCode: string) {
  const leaderId = roomSimLeaders.get(roomCode);
  if (!leaderId) return;
  io.to(roomCode).emit('room-sim-role', { roomCode, simLeaderId: leaderId });
}

function ensureRoomSimLeader(roomCode: string, preferredSocketId?: string) {
  const currentLeader = roomSimLeaders.get(roomCode);
  const leaderStillPresent =
    currentLeader &&
    currentLeader !== preferredSocketId &&
    io.sockets.sockets.get(currentLeader)?.rooms.has(roomCode);
  if (leaderStillPresent) return;
  const nextLeader = pickRoomSimLeader(roomCode) ?? preferredSocketId ?? null;
  if (nextLeader) {
    roomSimLeaders.set(roomCode, nextLeader);
    broadcastRoomSimRole(roomCode);
  } else {
    roomSimLeaders.delete(roomCode);
  }
}

// Socket.io Real-time Logic
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id} (transport: ${socket.conn.transport.name})`);

  socket.on('leave-room', (roomCode) => {
    const wasLeader = roomSimLeaders.get(roomCode) === socket.id;
    const locks = roomCellLocks.get(roomCode);
    if (locks) {
      for (const [key, lock] of locks) {
        if (lock.socketId === socket.id) locks.delete(key);
      }
    }
    socket.leave(roomCode);
    console.log(`User ${socket.id} left room: ${roomCode}`);
    if (wasLeader) {
      const nextLeader = pickRoomSimLeader(roomCode, socket.id);
      if (nextLeader) {
        roomSimLeaders.set(roomCode, nextLeader);
        broadcastRoomSimRole(roomCode);
      } else {
        roomSimLeaders.delete(roomCode);
      }
    }
  });

  socket.on('join-room', (roomCode) => {
    socket.join(roomCode);
    console.log(`User ${socket.id} joined room: ${roomCode}`);
    ensureRoomSimLeader(roomCode, socket.id);
    const leaderId = roomSimLeaders.get(roomCode);
    if (leaderId) {
      socket.emit('room-sim-role', { roomCode, simLeaderId: leaderId });
    }

    // Send current world state
    const world = db.prepare('SELECT * FROM worlds WHERE id = ?').get(roomCode);
    if (world) {
      socket.emit('world-state', {
        roomCode,
        grid: JSON.parse((world as any).grid),
        vehicles: JSON.parse((world as any).vehicles),
        economy: JSON.parse((world as any).economy || '{}'),
        traffic: JSON.parse((world as any).traffic || '{}')
      });
    } else {
      // Create room if it doesn't exist
      const now = Date.now();
      db.prepare('INSERT INTO worlds (id, grid, vehicles, economy, traffic, updatedAt) VALUES (?, ?, ?, ?, ?, ?)').run(roomCode, '{}', '{}', '{}', '{}', now);
      socket.emit('world-state', { roomCode, grid: {}, vehicles: {}, economy: {}, traffic: {} });
    }
    
    // Broadcast updated room list to everyone not in a room (for library-like view if needed)
    const rooms = db.prepare("SELECT id, updatedAt FROM worlds WHERE id != 'lobby' ORDER BY updatedAt DESC").all();
    io.emit('available-rooms', rooms);
  });

  // Initial data fetch
  const layouts = db.prepare('SELECT id, name, data FROM layouts').all();
  socket.emit('layouts-updated', layouts.map((l: any) => ({ ...l, data: JSON.parse(l.data) })));
  
  const sims = db.prepare('SELECT id, name, data FROM simulations').all();
  socket.emit('simulations-updated', sims.map((s: any) => ({ ...s, data: JSON.parse(s.data) })));

  socket.on('update-grid', ({ roomCode, updates }) => {
    if (!roomCode || !updates || typeof updates !== 'object') return;
    const world = db.prepare('SELECT grid FROM worlds WHERE id = ?').get(roomCode);
    if (!world) return;

    const now = Date.now();
    const locks = getRoomLocks(roomCode);
    pruneExpiredLocks(locks, now);

    const accepted: Record<string, unknown> = {};
    const rejected: string[] = [];

    for (const [key, val] of Object.entries(updates)) {
      const lock = locks.get(key);
      if (lock && lock.socketId !== socket.id && lock.expiresAt > now) {
        rejected.push(key);
        continue;
      }
      accepted[key] = val;
      locks.set(key, { socketId: socket.id, expiresAt: now + CELL_LOCK_TTL_MS });
    }

    if (Object.keys(accepted).length === 0) {
      socket.emit('grid-update-ack', { accepted: {}, rejected });
      return;
    }

    const currentGrid = JSON.parse((world as any).grid);
    const newGrid = { ...currentGrid, ...accepted };

    Object.keys(accepted).forEach(key => {
      if (accepted[key] === null) {
        delete newGrid[key];
      }
    });

    db.prepare('UPDATE worlds SET grid = ?, updatedAt = ? WHERE id = ?').run(
      JSON.stringify(newGrid),
      now,
      roomCode
    );

    socket.to(roomCode).emit('grid-updated', accepted);
    socket.emit('grid-update-ack', { accepted, rejected });
  });

  socket.on('update-vehicles', ({ roomCode, vehicles }) => {
    db.prepare('UPDATE worlds SET vehicles = ?, updatedAt = ? WHERE id = ?').run(JSON.stringify(vehicles), Date.now(), roomCode);
    socket.to(roomCode).emit('vehicles-updated', { roomCode, vehicles });
  });

  socket.on('update-economy', ({ roomCode, economy }) => {
    db.prepare('UPDATE worlds SET economy = ?, updatedAt = ? WHERE id = ?').run(JSON.stringify(economy), Date.now(), roomCode);
    socket.to(roomCode).emit('economy-updated', { roomCode, economy });
  });

  socket.on('update-traffic', ({ roomCode, traffic }) => {
    db.prepare('UPDATE worlds SET traffic = ?, updatedAt = ? WHERE id = ?').run(JSON.stringify(traffic), Date.now(), roomCode);
    socket.to(roomCode).emit('traffic-updated', { roomCode, traffic });
  });

  socket.on('save-layout', ({ name, data }) => {
    const id = Math.random().toString(36).substring(2, 11);
    db.prepare('INSERT INTO layouts (id, name, data, updatedAt) VALUES (?, ?, ?, ?)').run(id, name, JSON.stringify(data), Date.now());
    
    const allLayouts = db.prepare('SELECT id, name, data FROM layouts').all();
    io.emit('layouts-updated', allLayouts.map((l: any) => ({ ...l, data: JSON.parse(l.data) })));
  });

  socket.on('save-simulation', ({ name, data }) => {
    const id = Math.random().toString(36).substring(2, 11);
    db.prepare('INSERT INTO simulations (id, name, data, updatedAt) VALUES (?, ?, ?, ?)').run(id, name, JSON.stringify(data), Date.now());
    
    const allSims = db.prepare('SELECT id, name, data FROM simulations').all();
    io.emit('simulations-updated', allSims.map((s: any) => ({ ...s, data: JSON.parse(s.data) })));
  });

  socket.on('delete-layout', (id) => {
    db.prepare('DELETE FROM layouts WHERE id = ?').run(id);
    const allLayouts = db.prepare('SELECT id, name, data FROM layouts').all();
    io.emit('layouts-updated', allLayouts.map((l: any) => ({ ...l, data: JSON.parse(l.data) })));
  });

  socket.on('delete-simulation', (id) => {
    db.prepare('DELETE FROM simulations WHERE id = ?').run(id);
    const allSims = db.prepare('SELECT id, name, data FROM simulations').all();
    io.emit('simulations-updated', allSims.map((s: any) => ({ ...s, data: JSON.parse(s.data) })));
  });

  socket.on('delete-room', (roomCode) => {
    db.prepare('DELETE FROM worlds WHERE id = ?').run(roomCode);
    const rooms = db.prepare('SELECT id, updatedAt FROM worlds ORDER BY updatedAt DESC').all();
    io.emit('available-rooms', rooms);
  });

  socket.on('disconnect', (reason) => {
    console.log(`User disconnected: ${socket.id}, reason: ${reason}`);
    removeSocketLocks(socket);
    for (const roomCode of socket.rooms) {
      if (roomCode === socket.id) continue;
      if (roomSimLeaders.get(roomCode) === socket.id) {
        const nextLeader = pickRoomSimLeader(roomCode, socket.id);
        if (nextLeader) {
          roomSimLeaders.set(roomCode, nextLeader);
          broadcastRoomSimRole(roomCode);
        } else {
          roomSimLeaders.delete(roomCode);
        }
      }
    }
  });
});

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(process.cwd(), 'dist');
  app.use(express.static(distPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
