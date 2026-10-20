
import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import fs from 'fs';
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
const DB_PATH =
  process.env.GRIDCITY_DB ||
  (process.env.NODE_ENV === 'production' ? '/app/data/gridcity.db' : './gridcity.db');

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


// GridBot escalations — in-memory Map backed by JSON on the data volume.
type EscalationRecord = {
  id: string;
  status: 'pending' | 'done' | 'error';
  message: string;
  history: { role: 'user' | 'assistant'; content: string }[];
  context: unknown;
  roomCode: string | null;
  createdAt: number;
  reply?: string;
  actions?: unknown[];
  ask?: unknown;
  error?: string;
};

const ESCALATIONS_PATH =
  process.env.NODE_ENV === 'production'
    ? '/app/data/escalations.json'
    : path.join(process.cwd(), 'data', 'escalations.json');

const escalations = new Map<string, EscalationRecord>();

function loadEscalations() {
  try {
    if (!fs.existsSync(ESCALATIONS_PATH)) {
      console.log('escalations loaded 0');
      return;
    }
    const raw = JSON.parse(fs.readFileSync(ESCALATIONS_PATH, 'utf8'));
    const entries: EscalationRecord[] = Array.isArray(raw)
      ? raw
      : raw && typeof raw === 'object'
        ? Object.values(raw)
        : [];
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const rec of entries) {
      if (!rec || typeof rec.id !== 'string') continue;
      if (typeof rec.createdAt === 'number' && rec.createdAt < cutoff) continue;
      escalations.set(rec.id, rec as EscalationRecord);
    }
    console.log(`escalations loaded ${escalations.size}`);
  } catch {
    console.log('escalations loaded 0 (corrupt ignored)');
  }
}

function persistEscalations() {
  try {
    const dir = path.dirname(ESCALATIONS_PATH);
    fs.mkdirSync(dir, { recursive: true });
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const all = [...escalations.values()]
      .filter(r => typeof r.createdAt === 'number' && r.createdAt >= cutoff)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 200);
    escalations.clear();
    for (const r of all) escalations.set(r.id, r);
    const obj: Record<string, EscalationRecord> = {};
    for (const r of all) obj[r.id] = r;
    const tmp = ESCALATIONS_PATH + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(obj));
    fs.renameSync(tmp, ESCALATIONS_PATH);
  } catch (err: any) {
    console.log('escalations persist failed');
  }
}

loadEscalations();

function shouldEscalate(message: string, escalateFlag: unknown): boolean {
  return !!escalateFlag || /ask gridbot|hand off to gridbot|\bescalate\b/i.test(message);
}

function emitEscalation(rec: EscalationRecord) {
  io.emit('bot-escalation-reply', rec);
}

// In-game GrokBot text chat (xAI). Key via process.env.XAI_API_KEY only.
// Returns { reply, actions?, ask? } — client executes actions / handles ask+pick.
app.post('/api/bot/chat', async (req, res) => {
  const message = typeof req.body?.message === 'string' ? req.body.message.trim() : '';
  if (!message) {
    return res.status(400).json({ error: 'message required' });
  }

  const rawHistory = Array.isArray(req.body?.history) ? req.body.history : [];
  const history = rawHistory
    .filter((t: any) => t && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string')
    .map((t: any) => ({ role: t.role as 'user' | 'assistant', content: String(t.content) }))
    .slice(-20);

  const context = req.body?.context && typeof req.body.context === 'object' ? req.body.context : null;
  const pick = req.body?.pick && typeof req.body.pick === 'object' ? req.body.pick : null;

  const contextLines: string[] = [];
  if (context?.aim && Number.isFinite(context.aim.x) && Number.isFinite(context.aim.y)) {
    contextLines.push(`Default aim cell (viewport/selection): (${context.aim.x}, ${context.aim.y}).`);
  }
  if (context?.selection) {
    const s = context.selection;
    contextLines.push(`Active selection bbox: (${s.minX},${s.minY})–(${s.maxX},${s.maxY}). Prefer this as build origin (top-left) when placing.`);
  }
  if (pick) {
    contextLines.push(`User resolved a pick: ${JSON.stringify(pick)}. Continue the plan using this location/building.`);
  }

  if (shouldEscalate(message, req.body?.escalate)) {
    const id = crypto.randomUUID();
    const roomCode = typeof req.body?.roomCode === 'string' ? req.body.roomCode : null;
    const rec: EscalationRecord = {
      id,
      status: 'pending',
      message,
      history,
      context,
      roomCode,
      createdAt: Date.now(),
    };
    escalations.set(id, rec);
    persistEscalations();
    const webhook = process.env.GRIDBOT_ESCALATE_WEBHOOK_URL;
    if (webhook) {
      const auth = process.env.GRIDBOT_ESCALATE_WEBHOOK_AUTH || process.env.GRIDBOT_ESCALATE_BEARER;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (auth) {
        headers.Authorization = auth.startsWith('Bearer ') ? auth : `Bearer ${auth}`;
      }
      void fetch(webhook, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          id,
          message,
          history,
          context,
          roomCode,
          createdAt: rec.createdAt,
        }),
        signal: AbortSignal.timeout(3000),
      }).then(async (upstream) => {
        console.log(`webhook ${upstream.status}`);
        if (!upstream.ok) throw new Error(`webhook ${upstream.status}`);
      }).catch((err: any) => {
        const cur = escalations.get(id);
        if (!cur || cur.status !== 'pending') return;
        cur.status = 'error';
        cur.error = err?.message ? String(err.message) : 'webhook failed';
        persistEscalations();
        emitEscalation(cur);
      });
    } else {
      setTimeout(() => {
        const cur = escalations.get(id);
        if (!cur || cur.status !== 'pending') return;
        cur.status = 'done';
        cur.reply = `(stub) GridBot webhook not configured. Set GRIDBOT_ESCALATE_WEBHOOK_URL. Original ask: ${message.slice(0, 120)}`;
        cur.actions = [];
        persistEscalations();
        emitEscalation(cur);
      }, 1500);
    }
    return res.json({ reply: 'Asking GridBot…', escalate: { status: 'pending', id } });
  }

  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: 'XAI_API_KEY not configured' });
  }

  const system = `You are GrokBot, an in-game co-pilot for Grid City (multiplayer city-builder).
You can CHANGE the grid by returning structured JSON actions the CLIENT executes (same rules as the palette UI).

ALWAYS respond with a single JSON object only (no markdown unless wrapping JSON), shape:
{"reply":"short human message","actions":[...optional...],"ask":...optional...}

Action ops (prefer high-level for big builds):
- {"op":"build_neighborhood","homes":10,"school":true,"origin":{"x":0,"y":0}}
- {"op":"build_city","homes":100,"factories":10,"stores":10,"busService":true,"origin":{"x":0,"y":0}}
- {"op":"place_tile","x":0,"y":0,"tile":"road-straight","rotation":0}
- {"op":"place_building","x":0,"y":0,"tile":"building-home","rotation":0}
- {"op":"delete_cells","cells":[{"x":0,"y":0}]}
- {"op":"place_road_line","from":{"x":0,"y":0},"to":{"x":5,"y":0},"lane":"2"}
- {"op":"setup_bus_service","station":{"x":0,"y":0},"stops":[{"x":1,"y":0}],"buses":2}
  Each call adds one named route at that station and assigns the new buses to it. Existing routes stay.

Real tile ids only: building-home, building-school, building-factory, building-store, building-bus-station (2x2), road-bus-stop, road-straight, road-cross, etc.

Ask the user when location/building/count is ambiguous instead of guessing:
- {"ask":{"type":"pick_location","prompt":"Where should this neighborhood go?","pendingActions":[...]}}
- {"ask":{"type":"pick_building","prompt":"Which building should I expand?"}}
- {"ask":{"type":"choice","prompt":"How many houses?","options":["10","20","50"]}}
When ask is set, actions may be empty; put intended follow-up build ops in ask.pendingActions when useful.
If the user only asks a question, return {"reply":"..."} with no actions/ask.
Omit origin to use the client default aim. Keep reply brief; confirm what you will place.
Limits: up to ~150 buildings / command (batching is client-side).
ROAD CRAFT (must follow when placing roads / place_tile / place_road_line / loops):
- ports 0=N,1=E,2=S,3=W; worldPort=(localPort+(rotation%360)/90)%4
- straight: N-S rot 0/180; E-W 90/270
- corners / 90° turns → ALWAYS road-curve (local ports N+W=[0,3]) with rot table: open N+W→0, N+E→90, E+S→180, S+W→270. NEVER road-end / road-cul-de-sac for a turn — those open only one edge (local S/[2]) and stub the road.
- rectangle/closed loop: 4× road-curve at corners (NW open E+S→180, NE open S+W→270, SE open N+W→0, SW open N+E→90) + road-straight on sides; never ends/cul-de-sacs on loop corners
- T missing-edge: !E→0, !S→90, !W→180, !N→270; cross any rot
- road-roundabout: quarter ring (SE corner + west spur at rot 0), ports all four. road-roundabout-reverse is the vertical mirror. road-roundabout-4way is one tile: 2-lane arms on N/E/S/W and a single counterclockwise lane around the center; vehicles may go straight, left, right, or U-turn. Any rotation.
- save road-end / road-cul-de-sac only for true stubs (driveways, temporary dead-ends)
- no live autoOrient — type+rotation must already share edge ports with neighbors; mismatched rot breaks canEnterNext`;

  const messages = [
    { role: 'system', content: system },
    ...history,
    {
      role: 'user',
      content: contextLines.length
        ? `${message}\n\n[Context]\n${contextLines.join('\n')}`
        : message,
    },
  ];

  try {
    const upstream = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'grok-4',
        messages,
        temperature: 0.3,
      }),
    });

    const data: any = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const errMsg =
        (data && (data.error?.message || data.error)) ||
        `xAI request failed (${upstream.status})`;
      return res.status(502).json({ error: typeof errMsg === 'string' ? errMsg : 'xAI request failed' });
    }

    const replyRaw = data?.choices?.[0]?.message?.content;
    if (typeof replyRaw !== 'string' || !replyRaw.trim()) {
      return res.status(502).json({ error: 'Empty model reply' });
    }

    // Lightweight parse (mirrors client parseBotChatPayload)
    const parsePayload = (content: string) => {
      const trimmed = content.trim();
      const tryParse = (s: string) => {
        try {
          const obj = JSON.parse(s);
          if (!obj || typeof obj !== 'object') return null;
          const reply = typeof obj.reply === 'string' ? obj.reply.trim() : '';
          const actions = Array.isArray(obj.actions) ? obj.actions : undefined;
          const ask = obj.ask && typeof obj.ask === 'object' ? obj.ask : undefined;
          if (!reply && !actions?.length && !ask) return null;
          return { reply: reply || (ask?.prompt ? String(ask.prompt) : 'OK'), actions, ask };
        } catch {
          return null;
        }
      };
      const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fence) {
        const p = tryParse(fence[1].trim());
        if (p) return p;
      }
      if (trimmed.startsWith('{')) {
        const p = tryParse(trimmed);
        if (p) return p;
      }
      const brace = trimmed.indexOf('{');
      const last = trimmed.lastIndexOf('}');
      if (brace >= 0 && last > brace) {
        const p = tryParse(trimmed.slice(brace, last + 1));
        if (p) return p;
      }
      return { reply: trimmed };
    };

    const parsed = parsePayload(replyRaw);
    return res.json(parsed);
  } catch (err: any) {
    return res.status(502).json({ error: 'Failed to reach xAI' });
  }
});

app.get('/api/bot/escalate/:id', (req, res) => {
  const rec = escalations.get(req.params.id);
  if (!rec) return res.status(404).json({ error: 'not found' });
  return res.json(rec);
});

app.post('/api/bot/escalate/:id/reply', (req, res) => {
  const rec = escalations.get(req.params.id);
  if (!rec) return res.status(404).json({ error: 'not found' });
  if (typeof req.body?.reply === 'string') rec.reply = req.body.reply;
  if (Array.isArray(req.body?.actions)) rec.actions = req.body.actions;
  if (req.body?.ask !== undefined) rec.ask = req.body.ask;
  rec.status = 'done';
  persistEscalations();
  // Always re-emit so late clients (post soft-timeout) still get the socket event.
  emitEscalation(rec);
  return res.json(rec);
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
