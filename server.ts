
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
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

app.use(express.json());

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Simple health endpoint for Docker healthchecks and landing page monitoring
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', service: 'gridcity' });
});

// Socket.io Real-time Logic
io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id} (transport: ${socket.conn.transport.name})`);

  socket.on('disconnect', (reason) => {
    console.log(`User disconnected: ${socket.id}, reason: ${reason}`);
  });

  socket.on('join-room', (roomCode) => {
    socket.join(roomCode);
    console.log(`User ${socket.id} joined room: ${roomCode}`);
    
    // Send current world state
    const world = db.prepare('SELECT * FROM worlds WHERE id = ?').get(roomCode);
    if (world) {
      socket.emit('world-state', {
        grid: JSON.parse((world as any).grid),
        vehicles: JSON.parse((world as any).vehicles),
        economy: JSON.parse((world as any).economy || '{}')
      });
    } else {
      // Create room if it doesn't exist
      const now = Date.now();
      db.prepare('INSERT INTO worlds (id, grid, vehicles, economy, updatedAt) VALUES (?, ?, ?, ?, ?)').run(roomCode, '{}', '{}', '{}', now);
      socket.emit('world-state', { grid: {}, vehicles: {}, economy: {} });
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
    const world = db.prepare('SELECT grid FROM worlds WHERE id = ?').get(roomCode);
    if (world) {
      const currentGrid = JSON.parse((world as any).grid);
      // Merge updates
      const newGrid = { ...currentGrid, ...updates };
      
      // Clean up deleted fields (deleteField() equivalent)
      Object.keys(updates).forEach(key => {
        if (updates[key] === null) {
          delete newGrid[key];
        }
      });

      db.prepare('UPDATE worlds SET grid = ?, updatedAt = ? WHERE id = ?').run(JSON.stringify(newGrid), Date.now(), roomCode);
      
      // Broadcast to others in the room
      socket.to(roomCode).emit('grid-updated', updates);
    }
  });

  socket.on('update-vehicles', ({ roomCode, vehicles }) => {
    db.prepare('UPDATE worlds SET vehicles = ?, updatedAt = ? WHERE id = ?').run(JSON.stringify(vehicles), Date.now(), roomCode);
    socket.to(roomCode).emit('vehicles-updated', vehicles);
  });

  socket.on('update-economy', ({ roomCode, economy }) => {
    db.prepare('UPDATE worlds SET economy = ?, updatedAt = ? WHERE id = ?').run(JSON.stringify(economy), Date.now(), roomCode);
    socket.to(roomCode).emit('economy-updated', economy);
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

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
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
